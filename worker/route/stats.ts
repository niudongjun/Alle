import { Hono } from "hono";

export const statsRoutes = new Hono<{ Bindings: Env }>();

statsRoutes.get("/", async (c) => {
	const todayStart = Number(c.req.query("today_start"));
	if (!Number.isInteger(todayStart) || todayStart <= 0) {
		return c.json({ error: "Invalid stats today_start." }, 400);
	}
	const start = todayStart - 6 * 86400;
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
		// 前端传来的 today_start 已经是浏览器本地今天零点的 Unix 秒，
		// 这里直接减掉 6 天后按 86400 秒分桶，就能得到最近 7 个本地自然日的数量。
		c.env.DB.prepare(`
			SELECT
				CAST((sent_at - ?) / 86400 AS INTEGER) AS day_index,
				COUNT(*) AS count
			FROM emails
			WHERE sent_at >= ? AND sent_at < ?
			GROUP BY day_index
			ORDER BY day_index ASC
		`).bind(start, start, todayStart + 86400).all<{ day_index: number; count: number }>(),
	]);
	const dailyReceivedCounts = [0, 0, 0, 0, 0, 0, 0];
	for (const row of dailyResult.results || []) {
		dailyReceivedCounts[row.day_index] = row.count;
	}

	return c.json({
		total_email_count: summary?.total_email_count ?? 0,
		total_account_count: summary?.total_account_count ?? 0,
		unread_email_count: summary?.unread_email_count ?? 0,
		daily_received_counts: dailyReceivedCounts,
	});
});
