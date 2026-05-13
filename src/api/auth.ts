import { ApiError, apiRequest } from "./client";

export async function checkAuth() {
	try {
		return (await apiRequest<{ ok: true }>("/api/auth")).ok === true;
	} catch (error) {
		if (error instanceof ApiError && error.status === 401) return false;
		throw error;
	}
}

export async function login(secret: string, trusted: boolean) {
	return apiRequest<{ ok: true }>("/api/auth", {
		method: "POST",
		body: { secret, trusted },
	});
}
