import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "./client";

export type StatsDailyReceivedCount = {
	day: string;
	count: number;
};

export type Stats = {
	total_email_count: number;
	total_account_count: number;
	unread_email_count: number;
	daily_received_counts: StatsDailyReceivedCount[];
};

export const statsQueryKeys = {
	all: ["stats"] as const,
	summary: () => [...statsQueryKeys.all, "summary"] as const,
};

export function useStatsQuery() {
	return useQuery({
		queryKey: statsQueryKeys.summary(),
		queryFn: () => apiRequest<Stats>("/api/stats"),
	});
}
