import { useDeleteEmailMutation, useEmailQuery } from "@/api/email";
import MailAttachmentList from "@/components/MailAttachmentList";
import MailShadowHtml from "@/components/MailShadowHtml";
import { parseRawHeaders } from "@/lib/rawHeaders";
import { Info, Trash2, X } from "lucide-react";

type MailContentProps = {
	selectedEmailId: string | null;
	mobileEmailOpen: boolean;
	onCloseMobile: () => void;
	onDeleteEmail: () => void;
};

export default function MailContent({ selectedEmailId, mobileEmailOpen, onCloseMobile, onDeleteEmail }: MailContentProps) {
	const emailQuery = useEmailQuery(selectedEmailId);
	const deleteEmail = useDeleteEmailMutation();

	if (!selectedEmailId) {
		return (
			<article className={`absolute inset-y-0 right-0 z-30 flex w-full min-w-0 flex-col rounded-l-3xl bg-card shadow-xl transition-transform duration-300 ease-out ${mobileEmailOpen ? "translate-x-0" : "pointer-events-none translate-x-full"} md:static md:basis-2/3 md:flex-none md:pointer-events-auto md:translate-x-0 md:shadow-sm`}>
				<div className="flex flex-1 items-center justify-center text-sm font-medium tracking-widest text-muted-foreground uppercase">
					未选择邮件
				</div>
			</article>
		);
	}

	if (emailQuery.isPending) {
		return (
			<article className={`absolute inset-y-0 right-0 z-30 flex w-full min-w-0 flex-col rounded-l-3xl bg-card shadow-xl transition-transform duration-300 ease-out ${mobileEmailOpen ? "translate-x-0" : "pointer-events-none translate-x-full"} md:static md:basis-2/3 md:flex-none md:pointer-events-auto md:translate-x-0 md:shadow-sm`}>
				<div className="flex flex-1 items-center justify-center text-sm font-medium text-muted-foreground">
					邮件加载中
				</div>
			</article>
		);
	}

	if (emailQuery.isError || !emailQuery.data) {
		return (
			<article className={`absolute inset-y-0 right-0 z-30 flex w-full min-w-0 flex-col rounded-l-3xl bg-card shadow-xl transition-transform duration-300 ease-out ${mobileEmailOpen ? "translate-x-0" : "pointer-events-none translate-x-full"} md:static md:basis-2/3 md:flex-none md:pointer-events-auto md:translate-x-0 md:shadow-sm`}>
				<div className="flex flex-1 items-center justify-center text-sm font-medium text-muted-foreground">
					邮件加载失败
				</div>
			</article>
		);
	}

	const email = emailQuery.data;
	const parsedHeaders = parseRawHeaders(email.raw_headers);
	const routeNodes: string[] = [];

	// Different forwarding headers often repeat the same mailbox across adjacent hops. Collapse only
	// contiguous duplicates so the popover stays compact without inventing or reordering the route.
	for (const route of parsedHeaders.routes) {
		for (const value of [route.from, route.to]) {
			const normalized = value.trim();
			if (!normalized || routeNodes[routeNodes.length - 1] === normalized) continue;
			routeNodes.push(normalized);
		}
	}

	return (
		<article className={`absolute inset-y-0 right-0 z-30 flex w-full min-w-0 flex-col rounded-l-3xl bg-card shadow-xl transition-transform duration-300 ease-out ${mobileEmailOpen ? "translate-x-0" : "pointer-events-none translate-x-full"} md:static md:basis-2/3 md:flex-none md:pointer-events-auto md:translate-x-0 md:shadow-sm`}>
			<header className="flex shrink-0 items-start justify-between p-4 px-1 md:px-4 md:items-center">
				<div className="flex min-w-0 items-start">
					<button
						type="button"
						onClick={onCloseMobile}
						className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground md:hidden"
					>
						<X size={18} strokeWidth={2} />
					</button>
					<div className="min-w-0">
						<div className="mb-1 truncate text-base leading-tight font-semibold tracking-tight text-foreground">
							{email.from_name || email.from_address || email.account.remark || email.account.email}
						</div>
						<div className="truncate text-xs leading-tight text-muted-foreground">
							{email.from_address || email.account.email}
						</div>
					</div>
				</div>
				<div className="relative flex shrink-0 items-center">
					<button
						type="button"
						className="peer flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground focus:text-foreground"
					>
						<Info size={18} strokeWidth={1.5} />
					</button>
					<section className="pointer-events-none absolute top-full right-0 z-40 mt-1 w-64 max-w-[calc(100vw-2rem)] opacity-0 transition duration-150 ease-out peer-hover:pointer-events-auto peer-hover:opacity-100 peer-focus:pointer-events-auto peer-focus:opacity-100 hover:pointer-events-auto hover:opacity-100">
						<div className="max-h-180 overflow-auto rounded-3xl border border-border bg-popover p-3 text-popover-foreground shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							{parsedHeaders.rows.length ? (
								<div className="space-y-2">
									{parsedHeaders.rows.map((row) => (
										<div key={row.label} className="rounded-xl border border-border/60 bg-card/45 px-3 py-2.5">
											<div className="text-[10px] leading-4 font-semibold tracking-[0.16em] text-muted-foreground uppercase">
												{row.label}
											</div>
											<div className="mt-1.5 space-y-1 text-[11px] leading-5 break-all text-foreground">
												{row.values.map((value) => (
													<div key={value}>{value}</div>
												))}
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="rounded-2xl border border-dashed border-border/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
									未解析出常见结构化字段
								</div>
							)}
							<div className={`${parsedHeaders.rows.length ? "mt-2 border-t border-border/60 pt-2" : "mt-2"}`}>
								{routeNodes.length ? (
									<div className="space-y-1.5">
										{routeNodes.map((node, index) => (
											<div key={`${node}-${index}`} className="rounded-lg border border-border/55 bg-popover/70 px-2.5 py-1.5 text-[11px] leading-5 font-medium break-all text-foreground">
												{node}
											</div>
										))}
									</div>
								) : (
									<div className="rounded-2xl border border-dashed border-border/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
										未发现可解析的转发路径
									</div>
								)}
							</div>
						</div>
					</section>
					<button
						type="button"
						onClick={() => {
							if (deleteEmail.isPending) return;
							deleteEmail.mutate({ id: email.id }, { onSuccess: onDeleteEmail });
						}}
						className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
						disabled={deleteEmail.isPending}
					>
						<Trash2 size={18} strokeWidth={1.5} className={deleteEmail.isPending ? "animate-pulse" : ""} />
					</button>
				</div>
			</header>
			<div className="mx-2 mb-2 flex min-h-0 flex-1 flex-col">
				<h1 className="mx-2 mb-2 text-xl font-black tracking-tight text-foreground">
					{email.subject || "(无主题)"}
				</h1>
				<section className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border/80 bg-card/60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					<MailShadowHtml key={email.id} id={email.id} body={email.body} attachments={email.attachments} />
				</section>
				<MailAttachmentList emailId={email.id} attachments={email.attachments} className="mt-5 shrink-0 border-t border-border/70 pt-5" />
			</div>
		</article>
	);
}
