export function hideBootLoading() {
	const bootLoading = document.getElementById("app-boot-loading");
	if (!bootLoading || bootLoading.dataset.state === "hidden") return;
	bootLoading.dataset.state = "hidden";
	bootLoading.classList.add("is-hidden");
	window.setTimeout(() => bootLoading.remove(), 280);
}
