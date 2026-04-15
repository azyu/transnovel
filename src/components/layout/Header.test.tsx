import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Header } from './Header';
import { useDebugStore } from '../../stores/debugStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { useTranslationStore } from '../../stores/translationStore';
import { useUIStore } from '../../stores/uiStore';

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
});
