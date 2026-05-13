import { Hono } from "hono";

export const statsRoutes = new Hono<{ Bindings: Env }>();

statsRoutes.get("/", async (c) => {
	const [summary, dailyResult] = await Promise.all([
		c.env.DB.prepare(`
			SELECT
				(SELECT COUNT(*) FROM emails) AS total_email_count,
				(SELECT COUNT(*) FROM accounts) AS total_account_count,
				(SELECT COUNT(*) FROM emails WHERE read = 0) AS unread_email_count
		`).first<{
			total_email_count: number;
			total_account_count: number;
			unread_email_count: number;
		}>(),
		c.env.DB.prepare(`
			SELECT
				substr(date, 1, 10) AS date,
				COUNT(*) AS count
			FROM emails
			-- recv.ts 入库时已经把 date 统一转成 UTC 的 SQLite 日期字符串，这里直接按天截断聚合。
			WHERE date >= datetime('now', '-6 days', 'start of day')
				AND date < datetime('now', '+1 day', 'start of day')
			GROUP BY substr(date, 1, 10)
			ORDER BY date ASC
		`).all<{ date: string; count: number }>(),
	]);
	const today = new Date();
	today.setUTCHours(0, 0, 0, 0);
	const dailyCountMap = new Map((dailyResult.results || []).map((row) => [row.date, Number(row.count) || 0]));

	return c.json({
		total_email_count: Number(summary?.total_email_count) || 0,
		total_account_count: Number(summary?.total_account_count) || 0,
		unread_email_count: Number(summary?.unread_email_count) || 0,
		daily_received_counts: Array.from({ length: 7 }, (_, index) => {
			const date = new Date(today);
			date.setUTCDate(today.getUTCDate() - 6 + index);
			const key = date.toISOString().slice(0, 10);
			return {
				date: key,
				count: dailyCountMap.get(key) || 0,
			};
		}),
	});
});
