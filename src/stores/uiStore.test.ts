import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      currentTab: 'translation',
      theme: 'dark',
      toast: null,
      viewConfigVersion: 0,
    });
  });

  describe('tab management', () => {
    it('should set tab', () => {
      const { setTab } = useUIStore.getState();
      
      setTab('series');
      expect(useUIStore.getState().currentTab).toBe('series');
      
      setTab('settings');
      expect(useUIStore.getState().currentTab).toBe('settings');
    });
  });

  describe('theme management', () => {
    it('should toggle theme from dark to light', () => {
      const { toggleTheme } = useUIStore.getState();
      
      expect(useUIStore.getState().theme).toBe('dark');
      toggleTheme();
      expect(useUIStore.getState().theme).toBe('light');
    });

    it('should toggle theme from light to dark', () => {
      const { setTheme, toggleTheme } = useUIStore.getState();
      
      setTheme('light');
      toggleTheme();
      expect(useUIStore.getState().theme).toBe('dark');
    });

    it('should set theme directly', () => {
      const { setTheme } = useUIStore.getState();
      
      setTheme('light');
      expect(useUIStore.getState().theme).toBe('light');
      
      setTheme('dark');
      expect(useUIStore.getState().theme).toBe('dark');
    });
  });

  describe('toast management', () => {
    it('should show success toast', () => {
      const { showToast } = useUIStore.getState();
      
      showToast('작업 완료!');
      
      const toast = useUIStore.getState().toast;
      expect(toast).toEqual({ message: '작업 완료!', type: 'success' });
    });

    it('should show error toast without detail', () => {
      const { showError } = useUIStore.getState();
      
      showError('오류 발생');
      
      const toast = useUIStore.getState().toast;
      expect(toast).toEqual({ message: '오류 발생', type: 'error', detail: undefined });
    });

    it('should show error toast with detail', () => {
      const { showError } = useUIStore.getState();
      
      showError('오류 발생', '상세 내용입니다');
      
      const toast = useUIStore.getState().toast;
      expect(toast).toEqual({ 
        message: '오류 발생', 
        type: 'error', 
        detail: '상세 내용입니다' 
      });
    });

    it('should hide toast', () => {
      const { showToast, hideToast } = useUIStore.getState();
      
      showToast('메시지');
      expect(useUIStore.getState().toast).not.toBeNull();
      
      hideToast();
      expect(useUIStore.getState().toast).toBeNull();
    });
  });

  describe('viewConfigVersion', () => {
    it('should bump version', () => {
      const { bumpViewConfigVersion } = useUIStore.getState();
      
      expect(useUIStore.getState().viewConfigVersion).toBe(0);
      
      bumpViewConfigVersion();
      expect(useUIStore.getState().viewConfigVersion).toBe(1);
      
      bumpViewConfigVersion();
      expect(useUIStore.getState().viewConfigVersion).toBe(2);
    });
  });
});
