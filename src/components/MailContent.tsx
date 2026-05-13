import MailAttachmentList from "@/components/MailAttachmentList";
import MailShadowHtml from "@/components/MailShadowHtml";
import { useDeleteEmailMutation, useEmailQuery } from "@/api/email";
import { Trash2, X } from "lucide-react";

type MailContentProps = {
	selectedEmailId: string | null;
	mobileEmailOpen: boolean;
	onCloseMobile: () => void;
	onDeleteEmail: () => void;
};

export default function MailContent({ selectedEmailId, mobileEmailOpen, onCloseMobile, onDeleteEmail }: MailContentProps) {
	const emailQuery = useEmailQuery(selectedEmailId);
	const deleteEmail = useDeleteEmailMutation();
	const articleClassName = `absolute inset-y-0 right-0 z-30 flex w-full flex-col overflow-hidden rounded-l-3xl bg-card shadow-xl transition-transform duration-300 ease-out ${mobileEmailOpen ? "translate-x-0" : "pointer-events-none translate-x-full"} md:static md:z-0 md:w-2/3 md:flex-none md:pointer-events-auto md:translate-x-0 md:shadow-sm`;

	if (!selectedEmailId) {
		return (
			<article className={articleClassName}>
				<div className="flex flex-1 items-center justify-center text-sm font-medium tracking-widest text-muted-foreground uppercase">
					未选择邮件
				</div>
			</article>
		);
	}

	if (emailQuery.isPending) {
		return (
			<article className={articleClassName}>
				<div className="flex flex-1 items-center justify-center text-sm font-medium text-muted-foreground">
					邮件加载中
				</div>
			</article>
		);
	}

	if (emailQuery.isError || !emailQuery.data) {
		return (
			<article className={articleClassName}>
				<div className="flex flex-1 items-center justify-center text-sm font-medium text-muted-foreground">
					邮件加载失败
				</div>
			</article>
		);
	}

	const email = emailQuery.data;

	return (
		<article className={articleClassName}>
			<header className="flex shrink-0 items-start justify-between gap-4 p-4 md:items-center">
				<div className="flex min-w-0 items-start gap-3">
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
				<button
					type="button"
					onClick={() => {
						if (deleteEmail.isPending) return;
						deleteEmail.mutate({ id: email.id }, { onSuccess: onDeleteEmail });
					}}
					className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
					disabled={deleteEmail.isPending}
				>
					<Trash2 size={18} strokeWidth={1.5} className={deleteEmail.isPending ? "animate-pulse" : ""} />
				</button>
			</header>
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="mx-2 mb-2 flex min-h-0 flex-1 flex-col">
					<h1 className="mx-2 mb-2 text-xl font-black tracking-tight text-foreground">
						{email.subject || "(无主题)"}
					</h1>
					<section className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border/80 bg-card/60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						<MailShadowHtml key={email.id} id={email.id} body={email.body} attachments={email.attachments} />
					</section>
					<MailAttachmentList emailId={email.id} attachments={email.attachments} className="mt-5 shrink-0 border-t border-border/70 pt-5" />
				</div>
			</div>
		</article>
	);
}
