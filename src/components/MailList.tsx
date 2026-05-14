import { useUpdateAccountMutation, type Account } from "@/api/account";
import { useEmailsInfiniteQuery, useUpdateEmailReadMutation } from "@/api/email";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Circle, Search } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";

type MailListProps = {
	account: Account | null;
	selectedEmailId: string | null;
	onSelectEmail: (emailId: string) => void;
};

export default function MailList({ account, selectedEmailId, onSelectEmail }: MailListProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [editingRemark, setEditingRemark] = useState(false);
	const [remarkDraft, setRemarkDraft] = useState(account?.remark ?? "");
	const deferredSearchQuery = useDeferredValue(searchQuery);
	const scrollRef = useRef<HTMLDivElement>(null);
	const updateRead = useUpdateEmailReadMutation();
	const updateAccount = useUpdateAccountMutation();
	const searchText = deferredSearchQuery.trim();
	const listQuery = useEmailsInfiniteQuery({
		account_id: account?.id ?? null,
		q: searchText || null,
		limit: 40,
	});
	const emails = listQuery.data?.pages.flatMap((page) => page.items) ?? [];
	const virtualizer = useVirtualizer({
		count: listQuery.hasNextPage ? emails.length + 1 : emails.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 88,
		overscan: 8,
	});
	const saveRemark = () => {
		if (!account || updateAccount.isPending) return;
		const nextRemark = remarkDraft.trim() || null;
		if (nextRemark === account.remark) {
			setEditingRemark(false);
			setRemarkDraft(account.remark ?? "");
			return;
		}
		updateAccount.mutate({ id: account.id, body: { remark: nextRemark } }, { onSuccess: () => setEditingRemark(false) });
	};

	useEffect(() => {
		scrollRef.current?.scrollTo({ top: 0 });
	}, [account?.id, deferredSearchQuery]);

	useEffect(() => {
		// The mailbox view stays mounted while users jump between accounts. Reset the inline editor
		// whenever the backing account changes so a half-typed remark never leaks into another tab.
		setEditingRemark(false);
		setRemarkDraft(account?.remark ?? "");
	}, [account]);

	useEffect(() => {
		// TanStack Virtual only renders the rows near the viewport. Add one synthetic row when a next
		// page exists and watch for that placeholder to become the last rendered item. This avoids
		// brittle scroll-height math and still keeps infinite loading aligned with measured row heights.
		const lastItem = virtualizer.getVirtualItems().at(-1);
		if (!lastItem || !listQuery.hasNextPage || listQuery.isFetchingNextPage) return;
		if (lastItem.index < emails.length - 1) return;
		void listQuery.fetchNextPage();
	}, [emails.length, listQuery.fetchNextPage, listQuery.hasNextPage, listQuery.isFetchingNextPage, virtualizer]);

	return (
		<section className="flex h-full min-w-0 flex-1 flex-col bg-background/60 md:basis-1/3 md:flex-none">
			<div className="flex shrink-0 flex-col gap-4 px-4 pt-6 pb-4 sm:px-6 sm:pt-6 md:gap-5 md:pt-10">
				<div className="h-10 sm:h-11 md:h-12">
					<input
						type="text"
						value={editingRemark ? remarkDraft : account?.remark || account?.email || "全部邮件"}
						readOnly={!account || !editingRemark}
						onFocus={() => {
							if (!account || editingRemark) return;
							setEditingRemark(true);
							setRemarkDraft(account.remark ?? "");
						}}
						onChange={(event) => setRemarkDraft(event.target.value)}
						onBlur={saveRemark}
						onKeyDown={(event) => {
							// Chinese IMEs also use Enter to confirm the current candidate. Ignore that
							// composition phase so saving only happens after the final text is committed.
							if (event.nativeEvent.isComposing) return;
							if (event.key === "Escape") {
								setEditingRemark(false);
								setRemarkDraft(account?.remark ?? "");
								return;
							}
							if (event.key !== "Enter") return;
							event.currentTarget.blur();
						}}
						placeholder={account?.email || "备注"}
						className={`h-full w-full min-w-0 appearance-none rounded-lg px-3 py-0 text-lg leading-none font-bold tracking-tight text-foreground outline-none transition-colors sm:text-xl md:text-2xl ${editingRemark ? "bg-secondary focus:bg-muted" : "bg-transparent"} ${account ? "cursor-text" : ""}`}
					/>
				</div>
				<div className="group relative flex items-center">
					<Search size={16} className="pointer-events-none absolute left-4 text-muted-foreground transition-colors group-focus-within:text-foreground" />
					<input
						type="text"
						placeholder="搜索邮件..."
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
						className="w-full rounded-lg bg-secondary py-3 pl-10 pr-4 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:bg-muted md:py-3.5 md:pl-11"
					/>
				</div>
			</div>
			<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:pb-6 md:px-4 md:pb-10 [&::-webkit-scrollbar]:hidden">
				{listQuery.isPending ? (
					<div className="flex h-40 items-center justify-center text-sm font-medium text-muted-foreground">邮件加载中</div>
				) : listQuery.isError ? (
					<div className="flex h-40 items-center justify-center text-sm font-medium text-muted-foreground">邮件加载失败</div>
				) : emails.length === 0 ? (
					<div className="flex h-40 items-center justify-center text-sm font-medium text-muted-foreground">
						{searchText ? "未找到相关邮件" : "暂无邮件"}
					</div>
				) : (
					<div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
						{virtualizer.getVirtualItems().map((virtualRow) => {
							const email = emails[virtualRow.index];
							if (!email) {
								return (
									<div
										key="loading-more"
										className="absolute left-0 top-0 flex w-full items-center justify-center py-4 text-sm font-medium text-muted-foreground"
										style={{ transform: `translateY(${virtualRow.start}px)` }}
									>
										{listQuery.isFetchingNextPage ? "加载更多邮件..." : ""}
									</div>
								);
							}

							const isSelected = selectedEmailId === email.id;
							const now = new Date();
							const sentAt = new Date(email.sent_at * 1000);
							const sentAtLabel = sentAt.toLocaleString(
								undefined,
								sentAt.toDateString() === now.toDateString()
									? { hour: "2-digit", minute: "2-digit" }
									: sentAt.getFullYear() === now.getFullYear()
										? { month: "numeric", day: "numeric" }
										: { year: "numeric", month: "numeric", day: "numeric" },
							);

							return (
								<div
									key={email.id}
									ref={virtualizer.measureElement}
									className="absolute left-0 top-0 w-full py-0.5"
									data-index={virtualRow.index}
									style={{ transform: `translateY(${virtualRow.start}px)` }}
								>
									<div
										onClick={() => {
											// Selection should feel immediate. Fire the read mutation in parallel so the
											// drawer opens at once while the unread dot and weight update from cache refresh.
											onSelectEmail(email.id);
											if (email.read === 0) updateRead.mutate({ id: email.id, read: 1 });
										}}
										className={`group cursor-pointer rounded-xl p-4 transition-all duration-200 outline-none md:p-5 ${isSelected ? "bg-card shadow-sm" : "hover:bg-secondary"}`}
									>
										<div className="mb-1.5 flex items-center justify-between gap-3">
											<span className={`truncate text-sm tracking-wide ${email.read === 0 ? "font-bold text-foreground" : "font-medium text-secondary-foreground"}`}>
												{email.from_name || "未知发件人"}
											</span>
											<div className="flex shrink-0 items-center gap-1.5">
												{email.read === 0 && <Circle size={8} className="fill-current text-chart-1" />}
												<span className={`text-xs ${isSelected ? "text-muted-foreground" : "text-muted-foreground/70"}`}>
													{sentAtLabel}
												</span>
											</div>
										</div>
										<h3 className={`pr-2 text-sm leading-snug sm:text-base md:pr-4 ${email.read === 0 ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
											{email.subject || "(无主题)"}
										</h3>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</section>
	);
}
