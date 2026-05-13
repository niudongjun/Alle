import { create } from "zustand";
import { persist } from "zustand/middleware";

type AppStore = {
	activeAccount: string;
	setActiveAccount: (activeAccount: string) => void;
};

export const useAppStore = create<AppStore>()(persist(
	(set) => ({
		activeAccount: "dashboard",
		setActiveAccount: (activeAccount) => set({ activeAccount }),
	}),
	{
		name: "alle-app-store",
		partialize: (state) => ({ activeAccount: state.activeAccount }),
	},
));
