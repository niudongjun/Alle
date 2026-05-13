import { checkAuth, login } from "@/api/auth";
import { ApiError, apiUnauthorizedEvent } from "@/api/client";
import { useAccountsQuery } from "@/api/account";
import { useEmailsInfiniteQuery } from "@/api/email";
import { useStatsQuery } from "@/api/stats";
import Dashboard from "@/components/Dashboard";
import LoginPage from "@/components/LoginPage";
import MailContent from "@/components/MailContent";
import MailList from "@/components/MailList";
import Sidebar from "@/components/Sidebar";
import { useAppStore } from "@/store/useAppStore";
import { useEffect, useState } from "react";

function hideBootLoading() {
	const bootLoading = document.getElementById("app-boot-loading");
	if (!bootLoading || bootLoading.dataset.state === "hidden") return;
	bootLoading.dataset.state = "hidden";
	bootLoading.classList.add("is-hidden");
	window.setTimeout(() => bootLoading.remove(), 320);
}

function MailboxApp() {
	const activeAccount = useAppStore((state) => state.activeAccount);
	const setActiveAccount = useAppStore((state) => state.setActiveAccount);
	const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
	const [mobileEmailOpen, setMobileEmailOpen] = useState(false);
	const accountsQuery = useAccountsQuery();
	const statsQuery = useStatsQuery();
	const accounts = accountsQuery.data ?? [];
	const activeAccountRecord = accounts.find((account) => account.id === activeAccount);
	const emailsQuery = useEmailsInfiniteQuery(
		{
			account_id: activeAccount === "dashboard" || activeAccount === "all" ? null : activeAccount,
			limit: 40,
		},
	);

	useEffect(() => {
		if (!accountsQuery.isSuccess) return;
		if (activeAccount === "dashboard" || activeAccount === "all") return;
		// The selected tab is persisted in localStorage. Wait until the account list is loaded
		// before validating it, otherwise a refresh would treat the temporary empty array as
		// a deleted account and incorrectly bounce the user back to the dashboard.
		if (!activeAccountRecord) setActiveAccount("dashboard");
	}, [accountsQuery.isSuccess, activeAccount, activeAccountRecord, setActiveAccount]);

	useEffect(() => {
		// This boot loader is rendered in index.html so it can cover the blank page before
		// React mounts. Keep it visible until the three startup queries have all settled.
		// When localStorage restores an account id that no longer exists, wait for the
		// redirect back to the dashboard as well, otherwise the mask could disappear while
		// React is still about to replace the stale mailbox view with the real landing page.
		if (
			accountsQuery.status === "pending"
			|| statsQuery.status === "pending"
			|| emailsQuery.status === "pending"
			|| (accountsQuery.isSuccess && activeAccount !== "dashboard" && activeAccount !== "all" && !activeAccountRecord)
		) return;
		hideBootLoading();
	}, [
		accountsQuery.isSuccess,
		accountsQuery.status,
		activeAccount,
		activeAccountRecord,
		emailsQuery.status,
		statsQuery.status,
	]);

	return (
		<div className="flex h-svh w-full overflow-hidden bg-background font-sans text-foreground selection:bg-primary selection:text-primary-foreground">
			<Sidebar
				accounts={accounts}
				activeAccount={activeAccount}
				onSelectAccount={(accountId) => {
					setActiveAccount(accountId);
					setSelectedEmailId(null);
					setMobileEmailOpen(false);
				}}
			/>
			{activeAccount === "dashboard" ? (
				<Dashboard />
			) : (
				<div className="relative flex h-full min-w-0 flex-1 overflow-hidden">
					<MailList
						activeAccountId={activeAccount}
						title={activeAccount === "all" ? "全部邮件" : activeAccountRecord?.remark || activeAccountRecord?.email || "收件箱"}
						selectedEmailId={selectedEmailId}
						onSelectEmail={(emailId, openInMobile) => {
							setSelectedEmailId(emailId);
							if (openInMobile) setMobileEmailOpen(true);
						}}
					/>
					<MailContent
						selectedEmailId={selectedEmailId}
						mobileEmailOpen={mobileEmailOpen}
						onCloseMobile={() => setMobileEmailOpen(false)}
						onDeleteEmail={() => {
							setSelectedEmailId(null);
							setMobileEmailOpen(false);
						}}
					/>
				</div>
			)}
		</div>
	);
}

export default function App() {
	const [authState, setAuthState] = useState<"checking" | "guest" | "authed">("checking");
	const [loginPending, setLoginPending] = useState(false);
	const [loginError, setLoginError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		// Keep the mailbox subtree unmounted until the auth probe finishes. That guarantees
		// the existing account/stats/email queries never run before a valid cookie exists.
		void checkAuth()
			.then((ok) => {
				if (cancelled) return;
				setAuthState(ok ? "authed" : "guest");
				if (ok) setLoginError(null);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setAuthState("guest");
				setLoginError(error instanceof Error ? error.message : "服务端连接失败，请稍后重试。");
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		// Any protected request can raise this when the short-lived cookie expires. Switch
		// straight back to the login screen instead of leaving the mailbox panels in 401 state.
		const handleUnauthorized = () => setAuthState("guest");
		window.addEventListener(apiUnauthorizedEvent, handleUnauthorized);
		return () => window.removeEventListener(apiUnauthorizedEvent, handleUnauthorized);
	}, []);

	useEffect(() => {
		if (authState !== "guest") return;
		hideBootLoading();
	}, [authState]);

	if (authState === "checking") return null;

	if (authState === "guest") {
		return (
			<LoginPage
				pending={loginPending}
				error={loginError}
				onSubmit={async (secret, trusted) => {
					setLoginPending(true);
					setLoginError(null);
					try {
						await login(secret, trusted);
						setAuthState("authed");
					} catch (error) {
						setLoginError(error instanceof ApiError ? error.message : "登录失败，请稍后重试。");
					} finally {
						setLoginPending(false);
					}
				}}
			/>
		);
	}

	return <MailboxApp />;
}
