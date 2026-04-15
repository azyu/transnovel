import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useDebugStore } from '../stores/debugStore';
import { useUIStore } from '../stores/uiStore';
import { FOCUS_TRANSLATION_URL_INPUT_EVENT } from '../utils/tabShortcuts';

function TestHarness() {
  useKeyboardShortcuts();
  return null;
}

describe('useKeyboardShortcuts', () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalPlatform = window.navigator.platform;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useUIStore.setState({ currentTab: 'translation' });
    useDebugStore.setState({ debugMode: false });
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

  it('switches tabs with Cmd+number on macOS', async () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });

    await act(async () => {
      root.render(<TestHarness />);
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: '2', metaKey: true }));
    });

    expect(useUIStore.getState().currentTab).toBe('series');
  });

  it('switches tabs with Ctrl+number on Windows and Linux', async () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    });

    await act(async () => {
      root.render(<TestHarness />);
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: '3', ctrlKey: true }));
    });

    expect(useUIStore.getState().currentTab).toBe('settings');
  });

  it('keeps the debug shortcut on the platform primary modifier', async () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    });

    await act(async () => {
      root.render(<TestHarness />);
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'd', ctrlKey: true, shiftKey: true }));
    });

    expect(useDebugStore.getState().debugMode).toBe(true);
  });

  it('dispatches URL focus event for Cmd/Ctrl+L only on the translation tab', async () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });

    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

    await act(async () => {
      root.render(<TestHarness />);
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'l', metaKey: true }));
    });

    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: FOCUS_TRANSLATION_URL_INPUT_EVENT }));

    dispatchEventSpy.mockClear();
    act(() => {
      useUIStore.setState({ currentTab: 'series' });
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'l', metaKey: true }));
    });

    expect(dispatchEventSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: FOCUS_TRANSLATION_URL_INPUT_EVENT }));

    dispatchEventSpy.mockRestore();
  });
});
