const SHELL_CACHE = "alle-shell-v1";
const RUNTIME_CACHE = "alle-runtime-v1";
const CORE_ASSETS = [
	"/manifest.webmanifest",
	"/favicon.ico",
	"/favicon.svg",
	"/apple-touch-icon.png",
	"/icons/icon-192x192.png",
	"/icons/icon-512x512.png",
	"/icons/maskable-icon-192x192.png",
	"/icons/maskable-icon-512x512.png",
];

function extractShellAssets(html) {
	const assets = new Set(["/"]);
	for (const match of html.matchAll(/\b(?:href|src)=["'](\/[^"'#]+(?:\?[^"']+)?)["']/g)) {
		assets.add(match[1]);
	}
	for (const asset of CORE_ASSETS) {
		assets.add(asset);
	}
	return [...assets];
}

async function cacheShell() {
	const response = await fetch("/", { cache: "no-store" });
	if (!response.ok) {
		throw new Error(`Failed to fetch app shell: ${response.status}`);
	}

	// Built entry filenames are content-hashed, so the service worker reads the
	// current HTML and precaches the exact script and stylesheet URLs it points to.
	const html = await response.clone().text();
	const cache = await caches.open(SHELL_CACHE);
	await cache.put("/", response);
	await cache.addAll(extractShellAssets(html).filter((asset) => asset !== "/"));
}

self.addEventListener("install", (event) => {
	event.waitUntil((async () => {
		await cacheShell();
		await self.skipWaiting();
	})());
});

self.addEventListener("activate", (event) => {
	event.waitUntil((async () => {
		const cacheNames = await caches.keys();
		await Promise.all(
			cacheNames
				.filter((cacheName) => cacheName.startsWith("alle-") && cacheName !== SHELL_CACHE && cacheName !== RUNTIME_CACHE)
				.map((cacheName) => caches.delete(cacheName)),
		);
		await self.clients.claim();
	})());
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") {
		return;
	}

	const url = new URL(request.url);
	if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
		return;
	}

	if (request.mode === "navigate") {
		event.respondWith((async () => {
			try {
				const response = await fetch(request);
				const cache = await caches.open(SHELL_CACHE);
				await cache.put("/", response.clone());
				return response;
			} catch {
				return (await caches.match(request)) || (await caches.match("/")) || Response.error();
			}
		})());
		return;
	}

	if (
		["script", "style", "image", "font", "manifest", "worker"].includes(request.destination)
		|| /\.(?:css|js|mjs|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|otf|webmanifest)$/i.test(url.pathname)
	) {
		event.respondWith((async () => {
			const cached = await caches.match(request);
			const fetchPromise = fetch(request).then(async (response) => {
				if (response.ok) {
					const cache = await caches.open(RUNTIME_CACHE);
					await cache.put(request, response.clone());
				}
				return response;
			});
			if (cached) {
				void fetchPromise.catch(() => undefined);
				return cached;
			}
			return fetchPromise;
		})());
	}
});
