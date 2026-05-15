import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: 1,
			staleTime: 60 * 1000,
			refetchOnReconnect: 'always',
			refetchOnWindowFocus: 'always',
		},
	},
});

type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestOptions = {
	method?: RequestMethod;
	body?: unknown;
	signal?: AbortSignal;
};

export class ApiError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

export const apiUnauthorizedEvent = "api:unauthorized";

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const response = await fetch(path, {
		method: options.method || "GET",
		headers: options.body === undefined ? undefined : { "content-type": "application/json" },
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
		signal: options.signal,
	});
	const data = await response.json().catch(() => null) as { error?: string } | null;
	if (!response.ok) {
		// The auth cookie can be short-lived. Let App.tsx know immediately when any protected
		// request comes back 401 so it can drop the mailbox tree and render the login page again.
		if (response.status === 401 && typeof window !== "undefined") {
			window.dispatchEvent(new Event(apiUnauthorizedEvent));
		}
		throw new ApiError(response.status, data?.error || `Request failed: ${response.status}`);
	}
	return data as T;
}
