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

let logCounter = 0;
let logBuffer: DebugLogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export const useDebugStore = create<DebugState>((set) => ({
  debugMode: false,
  setDebugMode: (enabled) => set({ debugMode: enabled }),

  debugLogs: [],
  addDebugLog: (type: DebugLogEntry['type'], message: string, data?: unknown) => {
    logBuffer.push({ id: ++logCounter, timestamp: new Date(), type, message, data });
    
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        const logsToAdd = logBuffer;
        logBuffer = [];
        flushTimer = null;
        set((s) => ({
          debugLogs: [...s.debugLogs, ...logsToAdd].slice(-500),
        }));
      }, 50);
    }
  },
  clearDebugLogs: () => {
    logBuffer = [];
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    set({ debugLogs: [] });
  },
}));
