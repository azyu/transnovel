import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';
import { useDebugStore } from '../../stores/debugStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { useTranslationStore } from '../../stores/translationStore';
import { useUIStore } from '../../stores/uiStore';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async () => null),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

describe('Header', () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalPlatform = window.navigator.platform;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useUIStore.setState({
      currentTab: 'translation',
      theme: 'dark',
      language: 'ko',
    });
    useDebugStore.setState({ debugMode: false });
    useSeriesStore.setState({
      batchProgress: null,
      watchlistBadgeCount: 0,
    });
    useTranslationStore.setState({ isTranslating: false });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: originalPlatform,
    });
    vi.clearAllMocks();
  });

  it('shows a visible shortcut tooltip on hover for macOS', async () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });

    await act(async () => {
      root.render(<Header />);
    });

    const translationTab = container.querySelector('#tab-translation');
    expect(translationTab).toBeTruthy();

    act(() => {
      translationTab?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    expect(container.textContent).toContain('번역 (Cmd+1)');
  });

  it('shows a visible shortcut tooltip on hover for Windows and Linux', async () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    });

    await act(async () => {
      root.render(<Header />);
    });

    const translationTab = container.querySelector('#tab-translation');
    expect(translationTab).toBeTruthy();

    act(() => {
      translationTab?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    expect(container.textContent).toContain('번역 (Ctrl+1)');
  });

  it('renders main tab labels in English when the UI language is English', async () => {
    useUIStore.setState({ language: 'en' });

    await act(async () => {
      root.render(<Header />);
    });

    expect(container.textContent).toContain('Translation');
    expect(container.textContent).toContain('Watchlist');
    expect(container.textContent).toContain('Settings');
  });

  it('persists the selected language when switching from Korean to English', async () => {
    await act(async () => {
      root.render(<Header />);
    });

    const englishButton = Array.from(container.querySelectorAll('button')).find(
      (element) => element.textContent?.trim() === 'EN',
    );

    expect(englishButton).toBeTruthy();

    await act(async () => {
      englishButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useUIStore.getState().language).toBe('en');
    expect(invokeMock).toHaveBeenCalledWith('set_setting', {
      key: 'ui_language',
      value: 'en',
    });
    expect(container.textContent).toContain('Translation');
  });

  it('does not steal focus when the header first mounts', async () => {
    const outsideButton = document.createElement('button');
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    await act(async () => {
      root.render(<Header />);
    });

    expect(document.activeElement).toBe(outsideButton);
    outsideButton.remove();
  });

  it('uses a localized main tablist with roving focus and wrapping arrow navigation', async () => {
    await act(async () => {
      root.render(<Header />);
    });

    const tablist = container.querySelector('[role="tablist"]');
    const tabs = Array.from(container.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
    expect(tablist).toHaveAttribute('aria-label', '메인 탭');
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    let selectedAtFocus: string | null = null;
    tabs[1].addEventListener('focus', () => {
      selectedAtFocus = tabs[1].getAttribute('aria-selected');
    });

    act(() => {
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    });

    expect(useUIStore.getState().currentTab).toBe('series');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(tabs[1]);
    expect(selectedAtFocus).toBe('true');

    act(() => {
      tabs[1].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
    });
    expect(useUIStore.getState().currentTab).toBe('translation');
    expect(document.activeElement).toBe(tabs[0]);

    act(() => {
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }));
    });
    expect(useUIStore.getState().currentTab).toBe('settings');
    expect(document.activeElement).toBe(tabs[2]);

    act(() => {
      tabs[2].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }));
    });
    expect(useUIStore.getState().currentTab).toBe('translation');
    expect(document.activeElement).toBe(tabs[0]);

    act(() => {
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
    });
    expect(useUIStore.getState().currentTab).toBe('settings');
    expect(document.activeElement).toBe(tabs[2]);
  });

  it('focuses the selected tab after a programmatic tab change and exposes language pressed state', async () => {
    await act(async () => {
      root.render(<Header />);
    });

    const tabs = Array.from(container.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
    act(() => {
      useUIStore.getState().setTab('settings');
    });

    expect(document.activeElement).toBe(tabs[2]);

    const languageGroup = container.querySelector('[role="group"]');
    expect(languageGroup).toHaveAttribute('aria-label', '언어');
    const languageButtons = Array.from(languageGroup?.querySelectorAll('button') ?? []) as HTMLButtonElement[];
    expect(languageButtons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  });

  it('keeps active batch progress indeterminate until the backend exposes a true ordinal', async () => {
    useSeriesStore.setState({
      batchProgress: {
        current_chapter: 2,
        total_chapters: 2,
        chapter_title: '제목',
        status: 'translating',
      },
    });

    await act(async () => {
      root.render(<Header />);
    });

    const progress = container.querySelector('[role="progressbar"]');
    expect(progress).toHaveAttribute('aria-label', '진행률');
    expect(progress).not.toHaveAttribute('aria-valuenow');
    expect(progress).not.toHaveAttribute('aria-valuemax');
    expect(progress).not.toHaveAttribute('aria-valuetext');
    expect(progress?.textContent).toContain('번역 중');
    expect(progress?.textContent).not.toContain('2 / 2 화');
  });

  it('keeps terminal batch status nonvisual and exposes one announcement', async () => {
    useSeriesStore.setState({
      batchProgress: {
        current_chapter: 4,
        total_chapters: 4,
        chapter_title: '제목',
        status: 'error',
        error_message: '네트워크 오류',
      },
    });

    await act(async () => {
      root.render(<Header />);
    });

    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    const statuses = Array.from(container.querySelectorAll('[role="status"]'));
    expect(statuses).toHaveLength(1);
    expect(statuses[0].textContent).toContain('오류 발생');
    expect(statuses[0].textContent).toContain('네트워크 오류');
  });

  it('keeps zero-total batch progress indeterminate instead of exposing NaN', async () => {
    useSeriesStore.setState({
      batchProgress: {
        current_chapter: 0,
        total_chapters: 0,
        chapter_title: '',
        status: 'translating',
      },
    });

    await act(async () => {
      root.render(<Header />);
    });

    const progress = container.querySelector('[role="progressbar"]');
    expect(progress).not.toHaveAttribute('aria-valuenow');
    expect(progress).not.toHaveAttribute('aria-valuemax');
    expect(container.textContent).not.toContain('NaN');
  });
});
