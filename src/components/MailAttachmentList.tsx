import type { EmailAttachment } from "@/api/email";
import { FileImage, FileText, Paperclip } from "lucide-react";

type MailAttachmentListProps = {
	emailId: string;
	attachments: EmailAttachment[];
	className?: string;
};

export default function MailAttachmentList({ emailId, attachments, className }: MailAttachmentListProps) {
	const files = attachments.filter((attachment) => attachment.disposition !== "inline");
	if (files.length === 0) return null;

	return (
		<div className={className}>
			<div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
				<Paperclip size={15} className="text-muted-foreground" />
				<span>{files.length} 个附件</span>
			</div>
			<div className="flex flex-wrap gap-2">
				{files.map((attachment) => {
					const unitIndex = attachment.size === 0 ? 0 : Math.min(Math.floor(Math.log(attachment.size) / Math.log(1024)), 3);

					return (
						<a
							key={attachment.id}
							href={`/api/emails/${emailId}/attachments/${attachment.id}`}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-secondary"
						>
							{attachment.mimetype.startsWith("image/") ? <FileImage size={16} className="shrink-0 text-muted-foreground" /> : <FileText size={16} className="shrink-0 text-muted-foreground" />}
							<span className="max-w-40 truncate font-medium text-foreground">{attachment.filename}</span>
							<span className="shrink-0 text-xs text-muted-foreground">
								{attachment.size === 0 ? "0 B" : `${Number((attachment.size / 1024 ** unitIndex).toFixed(1))} ${["B", "KB", "MB", "GB"][unitIndex]}`}
							</span>
						</a>
					);
				})}
			</div>
		</div>
	);
}
