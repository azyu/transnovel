import { create } from 'zustand';

// Pending cache deletions live outside AdvancedSettings so the lock
// survives an unmount and remount of the settings screen.
interface CacheDeletionState {
  isClearingAll: boolean;
  // `${site}:${novel_id}` of the per-novel deletion in progress.
  clearingNovelKey: string | null;
  setClearingAll: (isClearingAll: boolean) => void;
  setClearingNovelKey: (key: string | null) => void;
}

export const useCacheDeletionStore = create<CacheDeletionState>((set) => ({
  isClearingAll: false,
  clearingNovelKey: null,
  setClearingAll: (isClearingAll) => set({ isClearingAll }),
  setClearingNovelKey: (clearingNovelKey) => set({ clearingNovelKey }),
}));
