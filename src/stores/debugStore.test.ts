import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useDebugStore } from './debugStore';

describe('useDebugStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useDebugStore.getState().clearDebugLogs();
    useDebugStore.setState({
      debugMode: false,
      debugLogs: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('debugMode', () => {
    it('should toggle debug mode', () => {
      const { setDebugMode } = useDebugStore.getState();
      
      expect(useDebugStore.getState().debugMode).toBe(false);
      
      setDebugMode(true);
      expect(useDebugStore.getState().debugMode).toBe(true);
      
      setDebugMode(false);
      expect(useDebugStore.getState().debugMode).toBe(false);
    });
  });

  describe('addDebugLog', () => {
    it('should add log after buffer flush', () => {
      const { addDebugLog } = useDebugStore.getState();
      
      addDebugLog('info', 'Test message');
      
      expect(useDebugStore.getState().debugLogs).toHaveLength(0);
      
      vi.advanceTimersByTime(50);
      
      const logs = useDebugStore.getState().debugLogs;
      expect(logs).toHaveLength(1);
      expect(logs[0].type).toBe('info');
      expect(logs[0].message).toBe('Test message');
    });

    it('should batch multiple logs', () => {
      const { addDebugLog } = useDebugStore.getState();
      
      addDebugLog('info', 'Message 1');
      addDebugLog('warn', 'Message 2');
      addDebugLog('error', 'Message 3');
      
      vi.advanceTimersByTime(50);
      
      const logs = useDebugStore.getState().debugLogs;
      expect(logs).toHaveLength(3);
      expect(logs[0].message).toBe('Message 1');
      expect(logs[1].message).toBe('Message 2');
      expect(logs[2].message).toBe('Message 3');
    });

    it('should assign incrementing ids', () => {
      const { addDebugLog } = useDebugStore.getState();
      
      addDebugLog('info', 'First');
      addDebugLog('info', 'Second');
      
      vi.advanceTimersByTime(50);
      
      const logs = useDebugStore.getState().debugLogs;
      expect(logs[0].id).toBeLessThan(logs[1].id);
    });

    it('should include data when provided', () => {
      const { addDebugLog } = useDebugStore.getState();
      const testData = { key: 'value', count: 42 };
      
      addDebugLog('info', 'With data', testData);
      
      vi.advanceTimersByTime(50);
      
      const logs = useDebugStore.getState().debugLogs;
      expect(logs[0].data).toEqual(testData);
    });

    it('should limit logs to 500 entries', () => {
      const { addDebugLog } = useDebugStore.getState();
      
      for (let i = 0; i < 600; i++) {
        addDebugLog('info', `Log ${i}`);
        vi.advanceTimersByTime(50);
      }
      
      expect(useDebugStore.getState().debugLogs.length).toBeLessThanOrEqual(500);
    });

    it('should store timestamp', () => {
      const { addDebugLog } = useDebugStore.getState();
      const before = new Date();
      
      addDebugLog('info', 'Timestamped');
      
      vi.advanceTimersByTime(50);
      
      const logs = useDebugStore.getState().debugLogs;
      expect(logs[0].timestamp).toBeInstanceOf(Date);
      expect(logs[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('clearDebugLogs', () => {
    it('should clear all logs', () => {
      const { addDebugLog, clearDebugLogs } = useDebugStore.getState();
      
      addDebugLog('info', 'Message 1');
      addDebugLog('info', 'Message 2');
      vi.advanceTimersByTime(50);
      
      expect(useDebugStore.getState().debugLogs.length).toBeGreaterThan(0);
      
      clearDebugLogs();
      
      expect(useDebugStore.getState().debugLogs).toHaveLength(0);
    });

    it('should clear pending buffer', () => {
      const { addDebugLog, clearDebugLogs } = useDebugStore.getState();
      
      addDebugLog('info', 'Buffered message');
      clearDebugLogs();
      vi.advanceTimersByTime(50);
      
      expect(useDebugStore.getState().debugLogs).toHaveLength(0);
    });
  });

  describe('log types', () => {
    it('should support all log types', () => {
      const { addDebugLog } = useDebugStore.getState();
      const types: Array<'chunk' | 'complete' | 'error' | 'warn' | 'info'> = [
        'chunk', 'complete', 'error', 'warn', 'info'
      ];
      
      types.forEach(type => addDebugLog(type, `${type} message`));
      vi.advanceTimersByTime(50);
      
      const logs = useDebugStore.getState().debugLogs;
      expect(logs).toHaveLength(5);
      types.forEach((type, i) => {
        expect(logs[i].type).toBe(type);
      });
    });
  });
});
