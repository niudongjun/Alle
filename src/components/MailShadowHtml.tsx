import type { EmailAttachment } from "@/api/email";
import { useEffect, useRef } from "react";

type MailShadowHtmlProps = {
	id: string;
	body: string | null;
	attachments: EmailAttachment[];
};

export default function MailShadowHtml({ id, body, attachments }: MailShadowHtmlProps) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const shadowRootRef = useRef<ShadowRoot | null>(null);

	useEffect(() => {
		if (!hostRef.current) return;
		if (!shadowRootRef.current) shadowRootRef.current = hostRef.current.attachShadow({ mode: "open" });

		const host = hostRef.current;
		const shadowRoot = shadowRootRef.current;
		let html = body;

		if (!html) {
			html = `<div style="padding:16px 20px;font:500 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#6b7280;">无正文</div>`;
		} else if (!/<\/?[a-z][\s\S]*>/i.test(html)) {
			html = `<pre style="margin:0;padding:16px 20px;white-space:pre-wrap;word-break:break-word;font:inherit;color:inherit;">${html.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;")}</pre>`;
		} else {
			for (const attachment of attachments) {
				// Many mail providers reference inline images through cid: URLs that only exist
				// inside the original MIME message. Rewriting them to our attachment endpoint keeps
				// the original HTML intact while making those images load normally in the browser.
				if (attachment.disposition !== "inline" || !attachment.content_id) continue;
				html = html.replace(
					new RegExp(`cid:${attachment.content_id.replace(/^<|>$/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"),
					new URL(`/api/emails/${id}/attachments/${attachment.id}`, window.location.origin).toString(),
				);
			}
		}

		shadowRoot.innerHTML = `<style>
:host {
	all: initial;
	display: block;
	width: 100%;
	height: auto;
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	font-size: 14px;
	line-height: 1.5;
	color: #13181d;
	word-break: break-word;
	pointer-events: none;
	-webkit-tap-highlight-color: transparent;
}
:host,
.mail-shadow-content,
.mail-shadow-content * {
	scrollbar-width: none;
}
.mail-shadow-content {
	background: #ffffff;
	width: fit-content;
	height: fit-content;
	min-width: 100%;
	${html.match(/<body[^>]*style="([^"]*)"[^>]*>/i)?.[1] || ""}
	pointer-events: none;
}
h1, h2, h3, h4 {
	font-size: 18px;
	font-weight: 700;
}
p {
	margin: 0;
}
a {
	color: #0e70df;
	text-decoration: none;
	pointer-events: auto;
}
.mail-shadow-content img:not(table img) {
	max-width: 100%;
	height: auto !important;
	pointer-events: auto;
}
.mail-shadow-content button,
.mail-shadow-content input,
.mail-shadow-content select,
.mail-shadow-content textarea,
.mail-shadow-content label,
.mail-shadow-content summary,
.mail-shadow-content [role="button"],
.mail-shadow-content [tabindex] {
	pointer-events: auto;
}
</style><div class="mail-shadow-content">${html.replace(/<\/?body[^>]*>/gi, "")}</div>`;

		for (const link of shadowRoot.querySelectorAll<HTMLAnchorElement>("a[href]")) {
			link.target = "_blank";
			link.rel = Array.from(new Set(`${link.rel} noopener noreferrer`.split(/\s+/).filter(Boolean))).join(" ");
		}

		const syncScale = () => {
			const content = shadowRoot.querySelector<HTMLElement>(".mail-shadow-content");
			const parentWidth = host.parentElement?.clientWidth || host.clientWidth;
			if (!content || !parentWidth || !content.scrollWidth) return;
			// Desktop newsletters often hard-code a wide table layout. Measuring the rendered width
			// after the HTML lands in the Shadow DOM lets the viewer preserve that original markup
			// and scale it to the available panel width instead of trying to rewrite the email CSS.
			host.style.zoom = String(parentWidth / content.scrollWidth);
		};

		const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncScale);
		if (resizeObserver) {
			if (host.parentElement) resizeObserver.observe(host.parentElement);
			const content = shadowRoot.querySelector<HTMLElement>(".mail-shadow-content");
			if (content) resizeObserver.observe(content);
		}

		const cleanupImageListeners: Array<() => void> = [];
		for (const image of shadowRoot.querySelectorAll("img")) {
			image.addEventListener("load", syncScale);
			image.addEventListener("error", syncScale);
			cleanupImageListeners.push(() => {
				image.removeEventListener("load", syncScale);
				image.removeEventListener("error", syncScale);
			});
		}

		const rafId = requestAnimationFrame(syncScale);

		return () => {
			cancelAnimationFrame(rafId);
			resizeObserver?.disconnect();
			for (const cleanup of cleanupImageListeners) cleanup();
		};
	}, [attachments, body, id]);

	return <div ref={hostRef} className="block w-full overflow-hidden" />;
}
