import { asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import * as schema from "../db/schema";

export const accountRoutes = new Hono<{ Bindings: Env }>();

accountRoutes.get("/", async (c) => {
	const db = drizzle(c.env.DB, { schema });
	const items = await db
		.select()
		.from(schema.accounts)
		.orderBy(asc(schema.accounts.sort_order), asc(schema.accounts.id))
		.all();

	return c.json({ items });
});

accountRoutes.get("/:id", async (c) => {
	const db = drizzle(c.env.DB, { schema });
	const item = await db
		.select()
		.from(schema.accounts)
		.where(eq(schema.accounts.id, c.req.param("id")))
		.get();

	if (!item) return c.json({ error: "Account not found." }, 404);
	return c.json({ item });
});

accountRoutes.put("/sort", async (c) => {
	const items = (await c.req.json<Array<{ id: string; sort_order: number }>>()).map((item) => ({
		id: item.id.trim(),
		sort_order: item.sort_order,
	}));
	if (items.length === 0) return c.json({ items: [] });

	const ids = new Set<string>();
	for (const item of items) {
		if (!Number.isInteger(item.sort_order)) {
			return c.json({ error: "Invalid account sort_order." }, 400);
		}
		if (ids.has(item.id)) {
			return c.json({ error: "Duplicate account sort id." }, 400);
		}
		ids.add(item.id);
	}

	const db = drizzle(c.env.DB, { schema });
	const rows = await db
		.select({
			id: schema.accounts.id,
		})
		.from(schema.accounts)
		.where(inArray(schema.accounts.id, items.map((item) => item.id)))
		.all();

	if (rows.length !== items.length) {
		const existingIds = new Set(rows.map((row) => row.id));
		return c.json({
			error: "Some accounts were not found.",
			ids: items.filter((item) => !existingIds.has(item.id)).map((item) => item.id),
		}, 404);
	}

	// 先校验整批账号是否存在，再写排序，避免前几条已更新、后几条才发现是非法 id。
	for (const item of items) {
		await db
			.update(schema.accounts)
			.set({ sort_order: item.sort_order })
			.where(eq(schema.accounts.id, item.id))
			.run();
	}

	return c.json({
		items: await db
			.select()
			.from(schema.accounts)
			.where(inArray(schema.accounts.id, items.map((item) => item.id)))
			.orderBy(asc(schema.accounts.sort_order), asc(schema.accounts.id))
			.all(),
	});
});

accountRoutes.put("/:id", async (c) => {
	const id = c.req.param("id");
	const body = await c.req.json<{ remark: string | null }>();
	const db = drizzle(c.env.DB, { schema });

	await db
		.update(schema.accounts)
		.set({
			remark: body.remark?.trim() || null,
		})
		.where(eq(schema.accounts.id, id))
		.run();

	const item = await db
		.select()
		.from(schema.accounts)
		.where(eq(schema.accounts.id, id))
		.get();

	if (!item) return c.json({ error: "Account not found." }, 404);
	return c.json({ item });
});

accountRoutes.delete("/:id", async (c) => {
	const db = drizzle(c.env.DB, { schema });
	const accountId = c.req.param("id");
	const account = await db
		.select()
		.from(schema.accounts)
		.where(eq(schema.accounts.id, accountId))
		.get();

	if (!account) return c.json({ error: "Account not found." }, 404);

	const attachmentRows = await db
		.select({
			object_key: schema.attachments.object_key,
		})
		.from(schema.attachments)
		.innerJoin(schema.emails, eq(schema.attachments.email_id, schema.emails.id))
		.where(eq(schema.emails.account_id, accountId))
		.all();

	// 数据库级联会删掉 emails 和 attachments 行，但 R2 对象不会跟着删。
	// 这里先删账号主记录，让列表状态立即生效；随后再按账号前缀兜底扫一遍桶，
	// 这样不仅能删掉当前数据库里还能查到的附件对象，也能把历史残留的脏对象一起清掉。
	await db.delete(schema.accounts).where(eq(schema.accounts.id, accountId)).run();

	const objectKeys = new Set(attachmentRows.map((row) => row.object_key));
	try {
		let cursor: string | undefined;
		for (;;) {
			const page = await c.env.ATTACHMENTS.list({
				prefix: `attachments/${accountId}/`,
				cursor,
			});
			for (const object of page.objects) objectKeys.add(object.key);
			if (!page.truncated) break;
			cursor = page.cursor;
		}

		const keys = [...objectKeys];
		for (let index = 0; index < keys.length; index += 1000) {
			await c.env.ATTACHMENTS.delete(keys.slice(index, index + 1000));
		}
	} catch (error) {
		console.error("删除账号后清理 R2 失败", {
			id: accountId,
			objectKeys: [...objectKeys],
			error,
		});
	}

	return c.json({
		ok: true,
		deleted_id: accountId,
	});
});
