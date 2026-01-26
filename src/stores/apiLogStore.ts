import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { ApiLogSummary } from '../types';

export type ApiLogFilter = 'all' | 'error' | 'success';

interface ApiLogState {
  logs: ApiLogSummary[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  filter: ApiLogFilter;
  isLoading: boolean;

  fetchLogs: () => Promise<void>;
  setFilter: (filter: ApiLogFilter) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  clearLogs: () => Promise<void>;
}

export const useApiLogStore = create<ApiLogState>((set, get) => ({
  logs: [],
  totalCount: 0,
  currentPage: 1,
  pageSize: 50,
  filter: 'all',
  isLoading: false,

  fetchLogs: async () => {
    const { filter, pageSize, currentPage } = get();
    set({ isLoading: true });

    try {
      const [logs, count] = await Promise.all([
        invoke<ApiLogSummary[]>('get_api_logs', {
          filter,
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
        }),
        invoke<number>('get_api_logs_count', { filter }),
      ]);

      set({ logs, totalCount: count, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch API logs:', error);
      set({ isLoading: false });
    }
  },

  setFilter: (filter) => {
    set({ filter, currentPage: 1 });
    get().fetchLogs();
  },

  setPage: (page) => {
    set({ currentPage: page });
    get().fetchLogs();
  },

  setPageSize: (size) => {
    set({ pageSize: size, currentPage: 1 });
    get().fetchLogs();
  },

  clearLogs: async () => {
    try {
      await invoke('clear_api_logs');
      set({ logs: [], totalCount: 0, currentPage: 1 });
    } catch (error) {
      console.error('Failed to clear API logs:', error);
    }
  },
}));
