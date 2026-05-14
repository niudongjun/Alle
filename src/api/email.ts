import { useInfiniteQuery, useMutation, useQuery, type InfiniteData } from "@tanstack/react-query";
import { apiRequest, queryClient } from "./client";
import type { Account } from "./account";

export type EmailAttachment = {
	id: string;
	email_id: string;
	object_key: string;
	filename: string;
	mimetype: string;
	size: number;
	content_id: string | null;
	disposition: string | null;
};

export type EmailListItem = {
	id: string;
	subject: string | null;
	from_name: string | null;
	sent_at: number;
	read: number;
};

export type EmailRecord = {
	id: string;
	account_id: string;
	subject: string | null;
	from_name: string | null;
	from_address: string | null;
	delivered_to: string | null;
	recipient: string | null;
	cc: string | null;
	bcc: string | null;
	sent_at: number;
	read: number;
	snippet: string | null;
	body: string | null;
	raw_headers: string | null;
	account: Account;
};

export type EmailDetail = EmailRecord & {
	attachments: EmailAttachment[];
};

export type EmailListFilters = {
	account_id?: string | null;
	read?: 0 | 1 | null;
	q?: string | null;
	limit?: number;
};

type EmailListResponse = {
	items: EmailListItem[];
	next_cursor: string | null;
	has_more: boolean;
};

type EmailDetailResponse = {
	item: EmailDetail;
};

type EmailRecordResponse = {
	item: EmailRecord;
};

type DeleteEmailResponse = {
	ok: true;
	deleted_count: number;
};

function buildEmailListQuery(filters: EmailListFilters, cursor?: string | null): string {
	const search = new URLSearchParams();
	if (filters.account_id) search.set("account_id", filters.account_id);
	if (filters.read !== undefined && filters.read !== null) search.set("read", String(filters.read));
	if (filters.q) search.set("q", filters.q);
	if (filters.limit) search.set("limit", String(filters.limit));
	if (cursor) search.set("cursor", cursor);
	const query = search.toString();
	return query ? `/api/emails?${query}` : "/api/emails";
}

export function useEmailsInfiniteQuery(filters: EmailListFilters = {}, enabled = true) {
	return useInfiniteQuery({
		queryKey: ["emails", "list", filters] as const,
		enabled,
		initialPageParam: null as string | null,
		queryFn: ({ pageParam, signal }) => apiRequest<EmailListResponse>(buildEmailListQuery(filters, pageParam), { signal }),
		getNextPageParam: (lastPage) => lastPage.next_cursor,
	});
}

export function useEmailQuery(id: string | null | undefined) {
	return useQuery({
		queryKey: ["emails", "detail", id || ""] as const,
		queryFn: async () => (await apiRequest<EmailDetailResponse>(`/api/emails/${id}`)).item,
		enabled: Boolean(id),
	});
}

export function useUpdateEmailReadMutation() {
	return useMutation({
		mutationFn: async ({ id, read }: { id: string; read: 0 | 1 }) =>
			(await apiRequest<EmailRecordResponse>(`/api/emails/${id}/read`, {
				method: "PATCH",
				body: { read },
			})).item,
		onSuccess: (item) => {
			queryClient.setQueryData(["emails", "detail", item.id] as const, (previous: EmailDetail | undefined) =>
				previous ? { ...item, attachments: previous.attachments } : previous
			);
			queryClient.invalidateQueries({ queryKey: ["emails"] as const });
			queryClient.invalidateQueries({ queryKey: ["stats"] });
		},
	});
}

export function useDeleteEmailMutation() {
	return useMutation({
		mutationFn: ({ id }: { id: string }) =>
			apiRequest<DeleteEmailResponse>(`/api/emails/${id}`, { method: "DELETE" }),
		onSuccess: (_, variables) => {
			queryClient.removeQueries({ queryKey: ["emails", "detail", variables.id] as const });
			queryClient.setQueriesData(
				{
					predicate: (query) =>
						Array.isArray(query.queryKey) &&
						query.queryKey[0] === "emails" &&
						query.queryKey[1] === "list",
				},
				(previous: InfiniteData<EmailListResponse> | undefined) =>
					previous
						? {
							...previous,
							pages: previous.pages.map((page) => ({
								...page,
								items: page.items.filter((item) => item.id !== variables.id),
							})),
						}
						: previous,
			);
			queryClient.invalidateQueries({ queryKey: ["emails"] as const });
			queryClient.invalidateQueries({ queryKey: ["stats"] });
		},
	});
}
