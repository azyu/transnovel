import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useSeriesStore } from './stores/seriesStore';
import { useTranslationStore } from './stores/translationStore';
import { useUIStore } from './stores/uiStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => null),
}));

vi.mock('./hooks/useTauriEvents', () => ({
  useTauriEvents: () => {},
}));

vi.mock('./hooks/useWatchlist', () => ({
  useWatchlist: () => ({
    loadWatchlistOnStartup: vi.fn(async () => {}),
  }),
}));

vi.mock('./components/common/AppUpdateController', () => ({
  AppUpdateController: () => null,
}));

vi.mock('./components/common/Toast', () => ({
  Toast: () => null,
}));

vi.mock('./components/layout/StatusBar', () => ({
  StatusBar: () => null,
}));

vi.mock('./components/translation/TranslationView', () => ({
  TranslationView: () => <button data-testid="translation-inner-focus">번역 내용</button>,
}));

vi.mock('./components/series/SeriesManager', () => ({
  SeriesManager: () => <div>관심작품</div>,
}));

vi.mock('./components/settings/SettingsPanel', () => ({
  SettingsPanel: () => <div>설정</div>,
}));

describe('App', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({ currentTab: 'translation', theme: 'dark', language: 'ko' });
    useSeriesStore.setState({ batchProgress: null });
    useTranslationStore.setState({ isTranslating: false });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('moves shortcut focus to the selected tab and isolates the mounted inactive translation panel', async () => {
    await act(async () => {
      root.render(<App />);
    });

    const translationContent = container.querySelector('[data-testid="translation-inner-focus"]') as HTMLButtonElement;
    act(() => {
      translationContent.focus();
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: '1', ctrlKey: true }));
      await Promise.resolve();
    });

    expect(useUIStore.getState().currentTab).toBe('translation');
    expect(document.activeElement).toBe(container.querySelector('#tab-translation'));

    act(() => {
      translationContent.focus();
    });
    const seriesTab = container.querySelector('#tab-series') as HTMLButtonElement;
    let selectedAtFocus: string | null = null;
    seriesTab.addEventListener('focus', () => {
      selectedAtFocus = seriesTab.getAttribute('aria-selected');
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: '2', ctrlKey: true }));
      await Promise.resolve();
    });

    expect(useUIStore.getState().currentTab).toBe('series');
    expect(document.activeElement).toBe(container.querySelector('#tab-series'));
    expect(selectedAtFocus).toBe('true');
    expect(container.querySelector('#panel-translation')).toHaveAttribute('inert', '');
    expect(container.querySelector('[data-testid="translation-inner-focus"]')).toBeTruthy();
  });
});
