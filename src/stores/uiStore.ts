import { create } from 'zustand';
import type { TabType } from '../types';

interface ToastData {
  message: string;
  type: 'success' | 'error';
  detail?: string;
}

interface UIState {
  currentTab: TabType;
  setTab: (tab: TabType) => void;

  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;

  toast: ToastData | null;
  showToast: (message: string) => void;
  showError: (message: string, detail?: string) => void;
  hideToast: () => void;

  viewConfigVersion: number;
  bumpViewConfigVersion: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentTab: 'translation',
  setTab: (tab) => set({ currentTab: tab }),

  theme: 'dark',
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

  toast: null,
  showToast: (message) => set({ toast: { message, type: 'success' } }),
  showError: (message, detail) => set({ toast: { message, type: 'error', detail } }),
  hideToast: () => set({ toast: null }),

  viewConfigVersion: 0,
  bumpViewConfigVersion: () => set((s) => ({ viewConfigVersion: s.viewConfigVersion + 1 })),
}));
