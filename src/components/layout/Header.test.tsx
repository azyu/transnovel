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
});
