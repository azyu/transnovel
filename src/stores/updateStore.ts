import { Channel, invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { useSeriesStore } from './seriesStore';
import { useTranslationStore } from './translationStore';

export interface AppUpdateInfo {
  currentVersion: string;
  version: string;
  body?: string | null;
}

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'installing'
  | 'error';

interface AppUpdateEvent {
  event: 'Started' | 'Progress' | 'Finished';
  data?: {
    contentLength?: number | null;
    chunkLength?: number;
  };
}

interface AppUpdateState {
  status: AppUpdateStatus;
  update: AppUpdateInfo | null;
  error: string | null;
  downloadedBytes: number;
  totalBytes: number | null;
  isDialogOpen: boolean;
  checkForUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  openDialog: () => void;
  dismissDialog: () => void;
}


export const useUpdateStore = create<AppUpdateState>((set, get) => ({
  status: 'idle',
  update: null,
  error: null,
  downloadedBytes: 0,
  totalBytes: null,
  isDialogOpen: false,

  checkForUpdate: async () => {
    const status = get().status;
    if (status === 'checking' || status === 'downloading' || status === 'installing') {
      return;
    }

    set({ status: 'checking', error: null });
    try {
      const update = await invoke<AppUpdateInfo | null>('check_for_update');
      if (update) {
        set({
          status: 'available',
          update,
          error: null,
          downloadedBytes: 0,
          totalBytes: null,
          isDialogOpen: true,
        });
        return;
      }

      set({
        status: 'up-to-date',
        update: null,
        error: null,
        downloadedBytes: 0,
        totalBytes: null,
        isDialogOpen: false,
      });
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        isDialogOpen: false,
      });
    }
  },

  installUpdate: async () => {
    const update = get().update;
    if (!update || get().status === 'downloading' || get().status === 'installing') {
      return;
    }

    const { isTranslating } = useTranslationStore.getState();
    const { batchProgress } = useSeriesStore.getState();
    const hasActiveWork =
      isTranslating ||
      batchProgress?.status === 'translating' ||
      batchProgress?.status === 'paused';
    if (hasActiveWork) {
      return;
    }

    const onEvent = new Channel<AppUpdateEvent>();
    onEvent.onmessage = (message) => {
      if (message.event === 'Started') {
        set({
          status: 'downloading',
          downloadedBytes: 0,
          totalBytes: message.data?.contentLength ?? null,
        });
      } else if (message.event === 'Progress') {
        set((state) => ({
          downloadedBytes: state.downloadedBytes + (message.data?.chunkLength ?? 0),
        }));
      } else if (message.event === 'Finished') {
        set({ status: 'installing' });
      }
    };

    set({ status: 'downloading', error: null, downloadedBytes: 0, totalBytes: null });
    try {
      await invoke('install_update', {
        expectedVersion: update.version,
        onEvent,
      });
      set({ status: 'installing' });
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        isDialogOpen: true,
      });
    }
  },

  openDialog: () => {
    if (get().update) {
      set({ isDialogOpen: true });
    }
  },

  dismissDialog: () => {
    const status = get().status;
    if (status !== 'downloading' && status !== 'installing') {
      set({ isDialogOpen: false });
    }
  },
}));
