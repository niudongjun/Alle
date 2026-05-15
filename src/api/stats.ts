import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "./client";

export type Stats = {
	total_email_count: number;
	total_account_count: number;
	unread_email_count: number;
	daily_received_counts: number[];
};

export function useStatsQuery() {
	const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

	return useQuery({
		queryKey: ["stats", todayStart],
		queryFn: () => apiRequest<Stats>(`/api/stats?today_start=${todayStart}`),
		refetchOnMount: 'always',
	});
}
