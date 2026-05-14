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
				strftime('%Y-%m-%d', sent_at, 'unixepoch') AS day,
				COUNT(*) AS count
			FROM emails
			WHERE sent_at >= unixepoch('now', '-6 days', 'start of day')
				AND sent_at < unixepoch('now', '+1 day', 'start of day')
			GROUP BY strftime('%Y-%m-%d', sent_at, 'unixepoch')
			ORDER BY day ASC
		`).all<{ day: string; count: number }>(),
	]);
	const today = new Date();
	today.setUTCHours(0, 0, 0, 0);
	const dailyCountMap = new Map((dailyResult.results || []).map((row) => [row.day, Number(row.count) || 0]));

	return c.json({
		total_email_count: Number(summary?.total_email_count) || 0,
		total_account_count: Number(summary?.total_account_count) || 0,
		unread_email_count: Number(summary?.unread_email_count) || 0,
		daily_received_counts: Array.from({ length: 7 }, (_, index) => {
			const day = new Date(today);
			day.setUTCDate(today.getUTCDate() - 6 + index);
			const key = day.toISOString().slice(0, 10);
			return {
				day: key,
				count: dailyCountMap.get(key) || 0,
			};
		}),
	});
});
