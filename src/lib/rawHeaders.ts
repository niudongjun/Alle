export type ParsedHeaderRow = {
	label: string;
	values: string[];
};

export type ParsedRouteHop = {
	from: string;
	to: string;
};

function decodeHeaderValue(value: string) {
	return value
		.replace(/\r\n[\t ]+/g, " ")
		.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (match, charset, encoding, encodedText) => {
			try {
				const decoder = new TextDecoder(String(charset).trim().toLowerCase() === "utf8" ? "utf-8" : String(charset).trim().toLowerCase() === "gb2312" ? "gbk" : String(charset).trim().toLowerCase() || "utf-8");
				if (String(encoding).toLowerCase() === "b") {
					return decoder.decode(Uint8Array.from(atob(String(encodedText).replace(/\s+/g, "")), (char) => char.charCodeAt(0)));
				}
				const source = String(encodedText).replace(/_/g, " ");
				const bytes: number[] = [];
				for (let i = 0; i < source.length; i += 1) {
					if (source[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(source.slice(i + 1, i + 3))) {
						bytes.push(Number.parseInt(source.slice(i + 1, i + 3), 16));
						i += 2;
						continue;
					}
					bytes.push(source.charCodeAt(i));
				}
				return decoder.decode(new Uint8Array(bytes));
			} catch {
				return match;
			}
		})
		.trim();
}

function parseAddressValues(value: string | undefined): string[] {
	if (!value) return [];
	const parts: string[] = [];
	let current = "";
	let quote = "";
	let angleDepth = 0;
	let parenDepth = 0;

	// 这里只做最外层切分，避免显示名里的逗号、注释、群组成员把一个地址列表拆坏。
	for (const char of decodeHeaderValue(value)) {
		if (quote) {
			current += char;
			if (char === quote) quote = "";
			continue;
		}
		if (char === "\"" || char === "'") {
			quote = char;
			current += char;
			continue;
		}
		if (char === "<") {
			angleDepth += 1;
			current += char;
			continue;
		}
		if (char === ">") {
			angleDepth = Math.max(0, angleDepth - 1);
			current += char;
			continue;
		}
		if (char === "(") {
			parenDepth += 1;
			current += char;
			continue;
		}
		if (char === ")") {
			parenDepth = Math.max(0, parenDepth - 1);
			current += char;
			continue;
		}
		if (char === "," && angleDepth === 0 && parenDepth === 0) {
			if (current.trim()) parts.push(current.trim());
			current = "";
			continue;
		}
		current += char;
	}
	if (current.trim()) parts.push(current.trim());

	return parts.map((part) => {
		const mailboxMatch = part.match(/^(.*?)(?:<([^<>]+)>)$/);
		if (mailboxMatch) {
			const name = mailboxMatch[1].trim().replace(/^["']|["']$/g, "");
			const address = mailboxMatch[2].trim();
			return name ? `${name} <${address}>` : address;
		}
		const addressMatch = part.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
		if (!addressMatch) return part;
		const name = part.replace(addressMatch[0], "").replace(/[<>]/g, "").trim().replace(/^["']|["']$/g, "");
		return name ? `${name} <${addressMatch[0]}>` : addressMatch[0];
	}).filter(Boolean);
}

function extractEmails(value: string | undefined): string[] {
	if (!value) return [];
	const emails: string[] = [];
	for (const match of decodeHeaderValue(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []) {
		const normalized = match.trim().toLowerCase();
		const [local = "", domain = ""] = normalized.split("@");
		if (!local || !domain || local.length > 64 || domain.length > 253 || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) continue;
		if (domain.split(".").some((label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) continue;
		if (!normalized || emails.includes(normalized)) continue;
		emails.push(normalized);
	}
	return emails;
}

export function parseRawHeaders(rawHeaders: string | null | undefined) {
	const raw = rawHeaders?.trim() || "";
	if (!raw) return { rows: [] as ParsedHeaderRow[], routes: [] as ParsedRouteHop[], raw: "" };

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { rows: [] as ParsedHeaderRow[], routes: [] as ParsedRouteHop[], raw };
	}
	if (!Array.isArray(parsed)) return { rows: [] as ParsedHeaderRow[], routes: [] as ParsedRouteHop[], raw };

	const headers = new Map<string, string[]>();
	const entries: Array<{ key: string; value: string }> = [];
	for (const item of parsed) {
		if (!Array.isArray(item) || item.length < 2) continue;
		const key = String(item[0] || "").trim().toLowerCase();
		const value = decodeHeaderValue(String(item[1] || "").trim());
		if (!key || !value) continue;
		entries.push({ key, value });
		if (headers.has(key)) headers.get(key)?.push(value);
		else headers.set(key, [value]);
	}

	const senderValues = parseAddressValues(headers.get("from")?.[0] || headers.get("sender")?.[0]);
	let recipientSource = "";
	const recipientValues: string[] = [];
	for (const key of ["to", "resent-to", "delivered-to", "apparently-to", "envelope-to", "x-envelope-to", "x-original-to", "original-recipient", "x-real-to"]) {
		for (const value of parseAddressValues(headers.get(key)?.[0])) {
			if (!value || recipientValues.includes(value)) continue;
			recipientValues.push(value);
		}
		if (!recipientValues.length) continue;
		recipientSource = headers.get(key)?.[0] || "";
		break;
	}

	const nodes: string[] = [];
	for (const value of [extractEmails(headers.get("from")?.[0] || headers.get("sender")?.[0])[0] || "", ...extractEmails(recipientSource)]) {
		const normalized = value.trim().toLowerCase();
		if (!normalized || nodes.includes(normalized)) continue;
		nodes.push(normalized);
	}

	// 不同服务商会把“中间收件人 / 自动转发目标 / 最终投递地址”塞进不同私有头。
	// 这里不再写死具体厂商，而是扫描所有名字像收件链的头，再把里面出现的邮箱按出现顺序串起来。
	for (const entry of entries) {
		if (entry.key === "received") {
			const normalized = entry.value.match(/\bfor\s+<?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?/i)?.[1]?.trim().toLowerCase() || "";
			if (!normalized || nodes.includes(normalized)) continue;
			nodes.push(normalized);
			continue;
		}
		if (entry.key === "reply-to" || entry.key === "return-path" || entry.key === "cc" || entry.key === "bcc") continue;
		if (entry.key.includes("encrypt")) continue;
		if (entry.key !== "to" && !entry.key.endsWith("-to") && !entry.key.includes("recipient") && !entry.key.includes("forward") && !entry.key.includes("fwd") && !entry.key.includes("deliver") && !entry.key.includes("envelope") && !entry.key.includes("resent") && !entry.key.includes("apparently")) continue;
		for (const value of extractEmails(entry.value)) {
			if (!value || nodes.includes(value)) continue;
			nodes.push(value);
		}
	}

	const routes: ParsedRouteHop[] = [];
	for (let i = 0; i < nodes.length - 1; i += 1) {
		routes.push({ from: nodes[i], to: nodes[i + 1] });
	}

	return {
		rows: [
			{ label: "发件人", values: senderValues },
			{ label: "收件人", values: recipientValues },
		].filter((row) => row.values.length),
		routes,
		raw,
	};
}
