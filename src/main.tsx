import "@/index.css";
import { queryClient } from "@/api/client.ts";
import App from "@/App.tsx";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
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

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>
	</StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
			console.error("service worker registration failed", error);
		});
	});
}
