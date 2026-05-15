import { ArrowRight, Check, LoaderCircle, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { login } from "@/api/auth";
import { ApiError } from "@/api/client";

export default function LoginPage({ onSuccess }: { onSuccess: () => void }) {
	const [secret, setSecret] = useState("");
	const [trusted, setTrusted] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	return (
		<div className="flex min-h-svh items-center justify-center bg-background px-8 text-foreground selection:bg-primary selection:text-primary-foreground">
			<div className="w-full max-w-md">
				<div className="mb-10 mx-2">
					<h1 className="mt-4 text-3xl font-black tracking-tight text-foreground sm:text-4xl">登录</h1>
					<p className="mt-3 text-sm leading-6 text-muted-foreground">输入密钥后进入邮件面板。</p>
				</div>
				<form
					onSubmit={async (event) => {
						event.preventDefault();
						if (pending || !secret.trim()) return;
						setPending(true);
						setError(null);
						try {
							await login(secret.trim(), trusted);
							onSuccess();
						} catch (error) {
							setError(error instanceof ApiError ? error.message : "登录失败，请稍后重试。");
						} finally {
							setPending(false);
						}
					}}
					className="space-y-5"
				>
					<div className="group flex items-center rounded-xl bg-secondary px-2 py-2 transition-all hover:bg-muted focus-within:bg-card focus-within:shadow-md">
						<LockKeyhole size={18} className="ml-3 shrink-0 text-muted-foreground transition-colors group-focus-within:text-foreground" />
						<input
							type="password"
							placeholder="输入密钥"
							value={secret}
							onChange={(event) => setSecret(event.target.value)}
							autoFocus
							disabled={pending}
							className="h-12 min-w-0 flex-1 bg-transparent px-3 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
						/>
						<button
							type="submit"
							disabled={pending || !secret.trim()}
							className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-chart-3 text-white transition-colors outline-none hover:bg-chart-3/90 disabled:cursor-not-allowed disabled:bg-background disabled:text-muted-foreground"
						>
							{pending ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} strokeWidth={2.5} />}
						</button>
					</div>
					<div className="min-h-5 text-sm font-medium text-destructive">
						{error}
					</div>
					<button
						type="button"
						onClick={() => setTrusted((value) => !value)}
						className="group flex items-center gap-3 text-left"
					>
						<div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${trusted ? "border-chart-3 bg-chart-3 text-white" : "border-border bg-background text-background group-hover:border-muted-foreground"}`}>
							<Check size={12} strokeWidth={3} className={trusted ? "opacity-100" : "opacity-0"} />
						</div>
						<span className={`text-sm font-medium transition-colors ${trusted ? "text-foreground" : "text-secondary-foreground group-hover:text-foreground"}`}>
							信任此设备
						</span>
					</button>
					<div className="pl-8 text-xs leading-5 text-muted-foreground">
						不勾选时登录有效期 10 分钟，勾选后会保持长期登录。
					</div>
				</form>
			</div>
		</div>
	);
}
