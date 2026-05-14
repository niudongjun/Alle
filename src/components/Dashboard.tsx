import { useStatsQuery } from "@/api/stats";
import { Circle, Inbox, Mail } from "lucide-react";

export default function Dashboard() {
	const { data, isError } = useStatsQuery();
	const activity = data?.daily_received_counts ?? [];
	const peak = Math.max(...activity, 1);

	return (
		<main className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto rounded-l-3xl bg-card p-4 shadow-sm sm:p-6 md:p-10 [&::-webkit-scrollbar]:hidden">
			<section className="mx-auto flex h-full w-full max-w-5xl flex-col">
				<h1 className="mb-4 text-3xl font-black tracking-tight text-foreground sm:text-4xl md:text-5xl">概览</h1>
				<p className="mb-8 text-base text-muted-foreground sm:text-lg md:mb-12">
					{isError ? "统计数据加载失败。" : `当前共有 ${data?.total_email_count || 0} 封邮件，${data?.unread_email_count || 0} 封未读，已接入 ${data?.total_account_count || 0} 个账号。`}
				</p>
				<div className="mb-10 grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2 md:mb-16 md:grid-cols-3 md:gap-6">
					<div className="flex aspect-[3/2] cursor-default flex-col justify-between rounded-xl bg-secondary p-3 sm:aspect-auto sm:min-h-48 sm:p-6 md:h-56 md:p-8">
						<div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase sm:text-sm">
							<Circle size={12} className="fill-current text-muted-foreground" />
							未读邮件
						</div>
						<div className="self-end text-right text-7xl font-black text-foreground">{data?.unread_email_count || 0}</div>
					</div>
					<div className="flex aspect-[3/2] cursor-default flex-col justify-between rounded-xl bg-chart-2/10 p-3 sm:aspect-auto sm:min-h-48 sm:p-6 md:h-56 md:p-8">
						<div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-chart-2 uppercase sm:text-sm">
							<Mail size={16} />
							全部邮件
						</div>
						<div className="self-end text-right text-7xl font-black text-chart-2">{data?.total_email_count || 0}</div>
					</div>
					<div className="flex aspect-[3/2] cursor-default flex-col justify-between rounded-xl bg-chart-1/10 p-3 sm:aspect-auto sm:min-h-48 sm:p-6 md:h-56 md:p-8">
						<div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-chart-1 uppercase sm:text-sm">
							<Inbox size={16} />
							已接入账号
						</div>
						<div className="self-end text-right text-7xl font-black text-chart-1">{data?.total_account_count || 0}</div>
					</div>
				</div>
				<div className="flex min-h-[220px] flex-1 flex-col md:min-h-[240px]">
					<div className="mb-6 text-sm font-semibold tracking-widest text-muted-foreground uppercase md:mb-8">最近 7 天</div>
					<div className="flex flex-1 items-end gap-2 sm:gap-3 md:gap-6">
						{activity.map((count, index) => (
							<div key={index} className="group relative flex h-full flex-1 items-end rounded-t-lg bg-secondary transition-colors duration-300 hover:bg-primary">
								<div className="w-full rounded-t-lg bg-primary/5 transition-colors duration-300 group-hover:bg-primary" style={{ height: `${count === 0 ? 8 : Math.max(12, count / peak * 100)}%` }}></div>
								<div className="absolute -top-9 left-1/2 hidden -translate-x-1/2 translate-y-2 text-sm font-bold text-foreground opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100 sm:block md:-top-10 md:text-base">{count}</div>
							</div>
						))}
					</div>
					<div className="mt-2 flex gap-2 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase sm:gap-3 sm:text-sm md:mt-6 md:gap-6">
						{activity.map((_, index) => (
							<span key={index} className="flex-1 text-center">{new Date(new Date().setHours(0, 0, 0, 0) - (6 - index) * 86400000).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</span>
						))}
					</div>
				</div>
			</section>
		</main>
	);
}
