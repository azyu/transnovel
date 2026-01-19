import { create } from 'zustand';

export interface DebugLogEntry {
  id: number;
  timestamp: Date;
  type: 'chunk' | 'complete' | 'error' | 'warn' | 'info';
  message: string;
  data?: unknown;
}

interface DebugState {
  debugMode: boolean;
  setDebugMode: (enabled: boolean) => void;

  debugLogs: DebugLogEntry[];
  addDebugLog: (type: DebugLogEntry['type'], message: string, data?: unknown) => void;
  clearDebugLogs: () => void;
}

export const useDebugStore = create<DebugState>((set) => ({
  debugMode: false,
  setDebugMode: (enabled) => set({ debugMode: enabled }),

  debugLogs: [],
  addDebugLog: (() => {
    let counter = 0;
    return (type: DebugLogEntry['type'], message: string, data?: unknown) =>
      set((s) => ({
        debugLogs: [
          ...s.debugLogs.slice(-499),
          { id: ++counter, timestamp: new Date(), type, message, data },
        ],
      }));
  })(),
  clearDebugLogs: () => set({ debugLogs: [] }),
}));
