import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "./client";

export type Account = {
	id: string;
	email: string;
	remark: string | null;
	sort_order: number;
};

export type UpdateAccountInput = {
	remark: string | null;
};

export type SortAccountInput = {
	id: string;
	sort_order: number;
};

export function useAccountsQuery() {
	return useQuery({
		queryKey: ["accounts", "list"] as const,
		queryFn: async ({ signal }) => (await apiRequest<{ items: Account[] }>("/api/accounts", { signal })).items,
		refetchOnMount: 'always',
	});
}

export function useAccountQuery(id: string | null | undefined) {
	return useQuery({
		queryKey: ["accounts", "detail", id || ""] as const,
		queryFn: async ({ signal }) => (await apiRequest<{ item: Account }>(`/api/accounts/${id}`, { signal })).item,
		enabled: Boolean(id),
	});
}

export function useUpdateAccountSortMutation() {
	return useMutation({
		mutationFn: async (items: SortAccountInput[]) =>
			(await apiRequest<{ items: Account[] }>("/api/accounts/sort", {
				method: "PUT",
				body: items,
			})).items,
		onSuccess: (items) => {
			// The sort API only sends back the rows whose sort_order changed. Merge them into the
			// cached full list first, then sort with the same fields the backend uses, otherwise
			// untouched accounts would disappear from the sidebar cache after a drag operation.
			queryClient.setQueryData(["accounts", "list"] as const, (previous: Account[] | undefined) => {
				const merged = new Map(previous?.map((item) => [item.id, item] as const));
				for (const item of items) merged.set(item.id, item);
				return [...merged.values()].sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id));
			});
			for (const item of items) queryClient.setQueryData(["accounts", "detail", item.id] as const, item);
		},
	});
}

export function useUpdateAccountMutation() {
	return useMutation({
		mutationFn: async ({ id, body }: { id: string; body: UpdateAccountInput }) =>
			(await apiRequest<{ item: Account }>(`/api/accounts/${id}`, {
				method: "PUT",
				body,
			})).item,
		onSuccess: (item) => {
			queryClient.setQueryData(["accounts", "detail", item.id] as const, item);
			queryClient.setQueryData(["accounts", "list"] as const, (previous: Account[] | undefined) => {
				const merged = new Map(previous?.map((current) => [current.id, current] as const));
				merged.set(item.id, item);
				return [...merged.values()].sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id));
			});
			// Mail details embed the joined account record, so email caches need a refresh after
			// changing the account remark; otherwise the detail pane can keep stale labels.
			queryClient.invalidateQueries({ queryKey: ["emails"] });
		},
	});
}

export function useDeleteAccountMutation() {
	return useMutation({
		mutationFn: ({ id }: { id: string }) =>
			apiRequest<{ ok: true; deleted_id: string }>(`/api/accounts/${id}`, { method: "DELETE" }),
		onSuccess: ({ deleted_id }) => {
			queryClient.removeQueries({ queryKey: ["accounts", "detail", deleted_id] as const });
			queryClient.setQueryData(["accounts", "list"] as const, (previous: Account[] | undefined) =>
				previous?.filter((item) => item.id !== deleted_id),
			);
			queryClient.invalidateQueries({ queryKey: ["emails"] });
			queryClient.invalidateQueries({ queryKey: ["stats"] });
		},
	});
}
