import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "./client";

export type Account = {
	id: string;
	email: string;
	remark: string | null;
	sort_order: number;
};

export const accountQueryKeys = {
	all: ["accounts"] as const,
	list: () => [...accountQueryKeys.all, "list"] as const,
};

export function useAccountsQuery() {
	return useQuery({
		queryKey: accountQueryKeys.list(),
		queryFn: async () => (await apiRequest<{ items: Account[] }>("/api/accounts")).items,
	});
}
