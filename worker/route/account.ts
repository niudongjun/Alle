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
	const body = await c.req.json<{ email: string; remark: string | null }>();
	const email = body.email.trim().toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return c.json({ error: "Invalid account email." }, 400);
	}
	const db = drizzle(c.env.DB, { schema });

	try {
		await db
			.update(schema.accounts)
			.set({
				email,
				remark: body.remark?.trim() || null,
			})
			.where(eq(schema.accounts.id, id))
			.run();
	} catch (error) {
		if (error instanceof Error && /unique/i.test(error.message)) return c.json({ error: "Account email already exists." }, 409);
		throw error;
	}

	const item = await db
		.select()
		.from(schema.accounts)
		.where(eq(schema.accounts.id, id))
		.get();

	if (!item) return c.json({ error: "Account not found." }, 404);
	return c.json({ item });
});

accountRoutes.put("/:id/avatar", async (c) => {
	const id = c.req.param("id");
	const db = drizzle(c.env.DB, { schema });
	const account = await db
		.select()
		.from(schema.accounts)
		.where(eq(schema.accounts.id, id))
		.get();

	if (!account) return c.json({ error: "Account not found." }, 404);

	const file = (await c.req.formData()).get("file");
	if (!(file instanceof File) || !file.type.startsWith("image/")) {
		return c.json({ error: "Avatar file is required." }, 400);
	}

	const avatarKey = `account-avatar/${id}/${crypto.randomUUID()}`;
	await c.env.ATTACHMENTS.put(avatarKey, await file.arrayBuffer(), {
		httpMetadata: {
			contentType: file.type,
		},
	});

	await db
		.update(schema.accounts)
		.set({ avatar_key: avatarKey })
		.where(eq(schema.accounts.id, id))
		.run();

	if (account.avatar_key && account.avatar_key !== avatarKey) {
		try {
			// 先切换数据库里的头像引用，再清理旧对象；这样即使 R2 删除失败，用户资料状态也已经是最新的。
			await c.env.ATTACHMENTS.delete(account.avatar_key);
		} catch (error) {
			console.error("更新账号头像后清理旧 R2 对象失败", {
				id,
				avatar_key: account.avatar_key,
				error,
			});
		}
	}

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

	// 数据库级联会删掉 emails 和 attachments 行，但 R2 对象仍然需要手动清理。
	await db.delete(schema.accounts).where(eq(schema.accounts.id, accountId)).run();

	const objectKeys = attachmentRows.map((row) => row.object_key);
	if (account.avatar_key) objectKeys.push(account.avatar_key);
	if (objectKeys.length > 0) {
		try {
			await c.env.ATTACHMENTS.delete(objectKeys);
		} catch (error) {
			console.error("删除账号后清理 R2 失败", {
				id: accountId,
				objectKeys,
				error,
			});
		}
	}

	return c.json({
		ok: true,
		deleted_id: accountId,
	});
});
