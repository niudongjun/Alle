import "@/index.css";
import { checkAuth } from "@/api/auth";
import { apiUnauthorizedEvent, queryClient } from "@/api/client.ts";
import App from "@/App.tsx";
import LoginPage from "@/components/LoginPage";
import { hideBootLoading } from "@/lib/bootLoading";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

// Keep the root theme class and browser color-scheme hint aligned with the OS
// preference so the CSS variable theme and any dark:* utilities switch together.
const systemColorScheme = window.matchMedia("(prefers-color-scheme: dark)");
const applySystemColorScheme = (isDark: boolean) => {
	document.documentElement.classList.toggle("dark", isDark);
	document.documentElement.style.colorScheme = isDark ? "dark" : "light";
};

applySystemColorScheme(systemColorScheme.matches);
systemColorScheme.addEventListener("change", (event) => {
	applySystemColorScheme(event.matches);
});

function AuthGate() {
	const [authState, setAuthState] = useState<boolean | null>(null);

	useEffect(() => {
		let cancelled = false;
		const handleUnauthorized = () => {
			if (cancelled) return;
			queryClient.clear();
			setAuthState(false);
			hideBootLoading();
		};
		window.addEventListener(apiUnauthorizedEvent, handleUnauthorized);
		void checkAuth()
			.then((ok) => {
				if (cancelled) return;
				if (!ok) {
					queryClient.clear();
					hideBootLoading();
				}
				setAuthState(ok);
			})
			.catch(() => {
				if (cancelled) return;
				queryClient.clear();
				setAuthState(false);
				hideBootLoading();
			});
		return () => {
			cancelled = true;
			window.removeEventListener(apiUnauthorizedEvent, handleUnauthorized);
		};
	}, []);

	if (authState === null) return null;

	if (authState === false) {
		return <LoginPage onSuccess={() => setAuthState(true)} />;
	}

	return (
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>
	);
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<AuthGate />
	</StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
			console.error("service worker registration failed", error);
		});
	});
}
