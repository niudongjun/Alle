import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
	id: text("id").primaryKey(),
	email: text("email").notNull(),
	remark: text("remark"),
	sort_order: integer("sort_order").notNull().default(0),
});

export const emails = sqliteTable("emails", {
	id: text("id").primaryKey(),
	account_id: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
	subject: text("subject"),
	from_name: text("from_name"),
	from_address: text("from_address"),
	delivered_to: text("delivered_to"),
	recipient: text("recipient"),
	cc: text("cc"),
	bcc: text("bcc"),
	sent_at: integer("sent_at"),
	body: text("body"),
	raw_headers: text("raw_headers"),
	read: integer("read").notNull().default(0),
});

export const attachments = sqliteTable("attachments", {
	id: text("id").primaryKey(),
	email_id: text("email_id").notNull().references(() => emails.id, { onDelete: "cascade" }),
	object_key: text("object_key").notNull(),
	filename: text("filename").notNull(),
	mimetype: text("mimetype").notNull(),
	size: integer("size").notNull(),
	content_id: text("content_id"),
	disposition: text("disposition"),
});
