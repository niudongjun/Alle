import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import PostalMime from "postal-mime";
import * as schema from "../db/schema";

type ParsedAddress = {
	name?: string | null;
	address?: string | null;
};

type ParsedAttachment = {
	filename?: string | null;
	mimeType?: string | null;
	content?: string | ArrayBuffer | ArrayBufferView;
	contentId?: string | null;
	disposition?: string | null;
};

type ParsedEmail = {
	deliveredTo?: string | null;
	from?: ParsedAddress | ParsedAddress[] | null;
	to?: ParsedAddress[] | null;
	cc?: ParsedAddress[] | null;
	bcc?: ParsedAddress[] | null;
	subject?: string | null;
	html?: string | null;
	text?: string | null;
	attachments?: ParsedAttachment[] | null;
};

function normalizeEmail(value: string): string {
	return value.trim().toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		if (!value || seen.has(value)) continue;
		seen.add(value);
		result.push(value);
	}
	return result;
}

function headerValue(headers: Headers, name: string): string | null {
	const value = headers.get(name);
	return value?.trim() || null;
}

function extractEmailAddresses(value: string | null | undefined): string[] {
	if (!value) return [];
	const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
	return uniqueStrings((matches || []).map(normalizeEmail));
}

function formatAddressList(value: ParsedAddress | ParsedAddress[] | null | undefined): string | null {
	const formatted = (!value ? [] : Array.isArray(value) ? value : [value])
		.map((item) => {
			const address = item.address?.trim();
			const name = item.name?.trim();
			if (name && address) return `${name} <${address}>`;
			return address || name || "";
		})
		.filter(Boolean);
	return formatted.length > 0 ? formatted.join(", ") : null;
}

function attachmentSize(content: string | ArrayBuffer | ArrayBufferView | undefined): number {
	if (!content) return 0;
	if (typeof content === "string") return new TextEncoder().encode(content).byteLength;
	if (content instanceof ArrayBuffer) return content.byteLength;
	if (ArrayBuffer.isView(content)) return content.byteLength;
	return 0;
}

function sanitizeFilename(value: string | null | undefined): string {
	const trimmed = value?.trim() || "untitled";
	let sanitized = "";
	for (const char of trimmed) {
		const code = char.charCodeAt(0);
		// Windows 文件名不能包含保留符号，ASCII 控制字符也要统一替换，避免对象 key 和下载文件名出现非法值。
		sanitized += code <= 31 || char === "/" || char === "\\" || char === ":" || char === "*" || char === "?" || char === "\"" || char === "<" || char === ">" || char === "|" ? "_" : char;
	}
	return sanitized;
}

function normalizeEmailSentAt(value: string | null | undefined): number {
	const sentAt = value ? new Date(value).getTime() : Date.now();
	return Math.floor((Number.isNaN(sentAt) ? Date.now() : sentAt) / 1000);
}

function errorSummary(error: unknown): { name: string; message: string; stack?: string } {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
		};
	}
	return {
		name: typeof error,
		message: String(error),
	};
}

function getAccountCandidates(message: ForwardableEmailMessage, parsed: ParsedEmail): string[] {
	let emails = extractEmailAddresses(headerValue(message.headers, "duck-original-to"));
	if (emails.length > 0) return emails;
	emails = extractEmailAddresses(headerValue(message.headers, "x-original-to"));
	if (emails.length > 0) return emails;
	emails = extractEmailAddresses(headerValue(message.headers, "original-recipient"));
	if (emails.length > 0) return emails;
	emails = extractEmailAddresses(headerValue(message.headers, "x-github-recipient-address"));
	if (emails.length > 0) return emails;
	emails = extractEmailAddresses(headerValue(message.headers, "destinations"));
	if (emails.length > 0) return emails;
	emails = extractEmailAddresses(headerValue(message.headers, "resent-to"));
	if (emails.length > 0) return emails;
	emails = extractEmailAddresses(headerValue(message.headers, "to"));
	if (emails.length > 0) return emails;
	emails = extractEmailAddresses(formatAddressList(parsed.to));
	if (emails.length > 0) return emails;
	emails = extractEmailAddresses(message.to);
	if (emails.length > 0) return emails;
	emails = extractEmailAddresses(parsed.deliveredTo || null);
	if (emails.length > 0) return emails;
	emails = extractEmailAddresses(headerValue(message.headers, "delivered-to"));
	if (emails.length > 0) return emails;
	emails = extractEmailAddresses(headerValue(message.headers, "x-forwarded-to"));
	if (emails.length > 0) return emails;
	emails = extractEmailAddresses(headerValue(message.headers, "x-envelope-to"));
	if (emails.length > 0) return emails;
	emails = extractEmailAddresses(headerValue(message.headers, "cc"));
	if (emails.length > 0) return emails;
	emails = extractEmailAddresses(headerValue(message.headers, "bcc"));
	if (emails.length > 0) return emails;
	emails = extractEmailAddresses(formatAddressList(parsed.cc));
	if (emails.length > 0) return emails;
	emails = extractEmailAddresses(formatAddressList(parsed.bcc));
	if (emails.length > 0) return emails;

	return [];
}

export async function emailHandler(
	message: ForwardableEmailMessage,
	env: Env,
	ctx: ExecutionContext
): Promise<void> {
	void ctx;
	try {
		if (message.rawSize <= 0) throw new Error(`Invalid email size: ${message.rawSize}`);
		if (message.rawSize > 25 * 1024 * 1024) throw new Error(`Email too large: ${message.rawSize}`);

		const reader = message.raw.getReader();
		let content = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			content += new TextDecoder().decode(value);
		}

		const parsed = await PostalMime.parse(content) as ParsedEmail;
		const db = drizzle(env.DB, { schema });
		const candidateEmails = getAccountCandidates(message, parsed);

		// 无论是自动转发还是直接投递到 Worker 域名邮箱，都必须先识别实际命中的收件地址，
		// 否则无法判断这封邮件应该归属到哪个 account。
		if (candidateEmails.length === 0) {
			message.setReject("Failed to determine forwarded account for this email.");
			return;
		}

		// 只按候选邮箱查账号，避免每次收件都全表读取 accounts。
		const matchedAccounts = await db
			.select({ id: schema.accounts.id, email: schema.accounts.email })
			.from(schema.accounts)
			.where(inArray(schema.accounts.email, candidateEmails))
			.all();
		let matchedAccount = null;
		for (const candidateEmail of candidateEmails) {
			const account = matchedAccounts.find((item) => item.email === candidateEmail);
			if (!account) continue;
			matchedAccount = account;
			break;
		}

		// 第一次见到某个自动转发邮箱时直接建号，新账号放到现有排序末尾；
		// 并发下若别人已经建好，则回查现有记录继续。
		if (!matchedAccount) {
			const accountEmail = candidateEmails[0];
			const accountId = crypto.randomUUID();
			const nextSortOrder = (await db
				.select({ value: sql<number>`COALESCE(MAX(${schema.accounts.sort_order}), -1) + 1` })
				.from(schema.accounts)
				.get())?.value ?? 0;
			const created = await db.insert(schema.accounts).values({
				id: accountId,
				email: accountEmail,
				remark: accountEmail,
				sort_order: nextSortOrder,
			}).onConflictDoNothing({
				target: schema.accounts.email,
			}).run();
			matchedAccount = (created.meta?.changes || 0) > 0
				? { id: accountId, email: accountEmail }
				: await db
					.select({ id: schema.accounts.id, email: schema.accounts.email })
					.from(schema.accounts)
					.where(eq(schema.accounts.email, accountEmail))
					.get();
		}

		if (!matchedAccount) {
			message.setReject("Failed to load forwarded account for this email.");
			return;
		}

		const emailId = crypto.randomUUID();
		const fromItems = !parsed.from ? [] : Array.isArray(parsed.from) ? parsed.from : [parsed.from];
		const fromAddress = fromItems.find((item) => item.address?.trim())?.address?.trim();
		const normalizedFromAddress = fromAddress ? normalizeEmail(fromAddress) : null;
		const fromName = fromItems.find((item) => item.name?.trim())?.name?.trim() || (normalizedFromAddress ? normalizedFromAddress.split("@")[0] : null);
		const uploadedKeys: string[] = [];
		const attachmentRows = [];

		// 附件文件本体先存 R2，数据库里只保存元数据和对象 key。
		for (const attachment of parsed.attachments || []) {
			const attachmentId = crypto.randomUUID();
			const filename = sanitizeFilename(attachment.filename);
			const mimetype = attachment.mimeType?.trim() || "application/octet-stream";
			const objectKey = `attachments/${matchedAccount.id}/${emailId}/${attachmentId}/${filename}`;
			await env.ATTACHMENTS.put(objectKey, attachment.content || "", {
				httpMetadata: { contentType: mimetype },
			});
			uploadedKeys.push(objectKey);
			attachmentRows.push({
				id: attachmentId,
				email_id: emailId,
				object_key: objectKey,
				filename,
				mimetype,
				size: attachmentSize(attachment.content),
				content_id: attachment.contentId?.trim() || null,
				disposition: attachment.disposition?.trim() || null,
			});
		}

		const emailValues = {
			id: emailId,
			account_id: matchedAccount.id,
			subject: parsed.subject?.trim() || null,
			from_name: fromName,
			from_address: normalizedFromAddress,
			delivered_to: matchedAccount.email,
			recipient: headerValue(message.headers, "to") || formatAddressList(parsed.to),
			cc: headerValue(message.headers, "cc") || formatAddressList(parsed.cc),
			bcc: headerValue(message.headers, "bcc") || formatAddressList(parsed.bcc),
			sent_at: normalizeEmailSentAt(headerValue(message.headers, "date")),
			body: parsed.html || parsed.text || null,
			raw_headers: JSON.stringify(Array.from(message.headers.entries())),
			read: 0 as const,
		};

		let insertedEmail = false;
		try {
			await db.insert(schema.emails).values(emailValues).run();
			insertedEmail = true;

			if (attachmentRows.length > 0) {
				await db.insert(schema.attachments).values(attachmentRows).run();
			}
		} catch (error) {
			// 邮件行和附件元数据要么都成功，要么尽量回滚已写入的数据和对象。
			if (insertedEmail) {
				try {
					await db.delete(schema.emails).where(eq(schema.emails.id, emailId)).run();
				} catch {
					// 删除回滚失败只影响清理，不应该吞掉原始入库错误。
				}
			}
			if (uploadedKeys.length > 0) {
				try {
					await env.ATTACHMENTS.delete(uploadedKeys);
				} catch {
					// 对象清理失败同样只做记录保留，让外层继续按原始失败处理。
				}
			}
			throw error;
		}
	} catch (error) {
		console.error("邮件接收失败", {
			envelopeFrom: message.from || null,
			envelopeTo: message.to || null,
			rawSize: message.rawSize,
			error: errorSummary(error),
		});
		message.setReject("Failed to process inbound email.");
	}
}
