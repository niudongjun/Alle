import type { Account } from "@/api/account";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox, LayoutDashboard, RefreshCw } from "lucide-react";
import { useState } from "react";

export default function Sidebar({
	accounts,
	activeAccount,
	onSelectAccount,
}: {
	accounts: Account[];
	activeAccount: string;
	onSelectAccount: (accountId: string) => void;
}) {
	const [isRefreshing, setIsRefreshing] = useState(false);
	const queryClient = useQueryClient();

	return (
		<aside className="relative z-20 flex h-full w-20 shrink-0 flex-col items-center pt-6 md:pt-10">
			<div className="relative mb-6 md:mb-8">
				<button
					type="button"
					onClick={async () => {
						if (isRefreshing) return;
						setIsRefreshing(true);
						try {
							await Promise.all([
								queryClient.invalidateQueries({ queryKey: ["accounts"] }),
								queryClient.invalidateQueries({ queryKey: ["emails"] }),
							]);
						} finally {
							setIsRefreshing(false);
						}
					}}
					className="peer flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground"
				>
					<RefreshCw size={18} strokeWidth={2} className={isRefreshing ? "animate-spin text-foreground" : ""} />
				</button>
				<div className="pointer-events-none absolute left-full top-1/2 ml-4 hidden -translate-y-1/2 translate-x-[-10px] whitespace-nowrap rounded-sm bg-foreground px-3.5 py-2 text-xs font-medium text-background opacity-0 transition-all duration-300 peer-hover:translate-x-0 peer-hover:opacity-100 peer-focus-visible:translate-x-0 peer-focus-visible:opacity-100 md:block">
					刷新
				</div>
			</div>
			<nav className="flex min-h-0 flex-1 flex-col items-center gap-5 md:gap-6">
				<div className="relative">
					<button
						type="button"
						onClick={() => onSelectAccount("dashboard")}
						className={`peer flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300 ease-out outline-none ${activeAccount === "dashboard" ? "bg-card ring-2 ring-inset ring-chart-3" : "bg-chart-3/12"} text-chart-3`}
					>
						<LayoutDashboard size={20} strokeWidth={activeAccount === "dashboard" ? 2.5 : 2} />
					</button>
					<div className="pointer-events-none absolute left-full top-1/2 ml-4 hidden -translate-y-1/2 translate-x-[-10px] whitespace-nowrap rounded-sm bg-foreground px-3.5 py-2 text-xs font-medium text-background opacity-0 transition-all duration-300 peer-hover:translate-x-0 peer-hover:opacity-100 peer-focus-visible:translate-x-0 peer-focus-visible:opacity-100 md:block">
						概览
					</div>
				</div>
				<div className="relative">
					<button
						type="button"
						onClick={() => onSelectAccount("all")}
						className={`peer flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300 ease-out outline-none ${activeAccount === "all" ? "bg-card ring-2 ring-inset ring-chart-5" : "bg-chart-5/12"} text-chart-5`}
					>
						<Inbox size={20} strokeWidth={activeAccount === "all" ? 2.5 : 2} />
					</button>
					<div className="pointer-events-none absolute left-full top-1/2 ml-4 hidden -translate-y-1/2 translate-x-[-10px] whitespace-nowrap rounded-sm bg-foreground px-3.5 py-2 text-xs font-medium text-background opacity-0 transition-all duration-300 peer-hover:translate-x-0 peer-hover:opacity-100 peer-focus-visible:translate-x-0 peer-focus-visible:opacity-100 md:block">
						全部
					</div>
				</div>
				<div className="relative min-h-0 w-12 flex-1">
					<div className="absolute inset-y-0 left-0 flex w-max flex-col gap-5 overflow-y-auto py-1 md:pointer-events-none md:gap-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						{accounts.map((account, index) => {
							const label = account.remark || account.email;
							const isActive = activeAccount === account.id;

							return (
								<div key={account.id} className="flex w-max items-center gap-4">
									<button
										type="button"
										onClick={() => onSelectAccount(account.id)}
										className={`peer flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all duration-300 ease-out outline-none md:pointer-events-auto ${isActive ? "bg-card ring-2 ring-inset " : ""}${[
											isActive ? "text-chart-1 ring-chart-1" : "bg-chart-1/12 text-chart-1",
											isActive ? "text-chart-2 ring-chart-2" : "bg-chart-2/12 text-chart-2",
											isActive ? "text-chart-3 ring-chart-3" : "bg-chart-3/12 text-chart-3",
											isActive ? "text-chart-4 ring-chart-4" : "bg-chart-4/12 text-chart-4",
										][index % 4]}`}
									>
										<span className={`text-lg leading-none tracking-tighter ${isActive ? "font-bold" : "font-semibold"}`}>
											{label.trim().charAt(0).toUpperCase() || account.email.charAt(0).toUpperCase()}
										</span>
									</button>
									<div className="pointer-events-none hidden translate-x-[-10px] whitespace-nowrap rounded-sm bg-foreground px-3.5 py-2 text-xs font-medium text-background opacity-0 transition-all duration-300 peer-hover:translate-x-0 peer-hover:opacity-100 peer-focus-visible:translate-x-0 peer-focus-visible:opacity-100 md:block">
										{label}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</nav>
		</aside>
	);
}
