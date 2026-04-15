import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UrlInput } from './UrlInput';
import { useTranslationStore } from '../../stores/translationStore';
import { useUIStore } from '../../stores/uiStore';
import { FOCUS_TRANSLATION_URL_INPUT_EVENT } from '../../utils/tabShortcuts';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => null),
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    parseAndTranslate: vi.fn(async () => {}),
    parseChapter: vi.fn(async () => {}),
    loading: false,
  }),
}));

vi.mock('../../utils/urlHistory', () => ({
  getUrlHistory: vi.fn(() => []),
  saveUrlHistory: vi.fn(),
}));

describe('UrlInput', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useUIStore.setState({ theme: 'dark' });
    useTranslationStore.setState({
      currentUrl: 'https://example.com/novel/1',
      isTranslating: false,
      chapter: null,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it('focuses and selects the URL input when the focus event is dispatched', async () => {
    await act(async () => {
      root.render(<UrlInput historyKey="test_url_history" />);
    });

    const input = container.querySelector('input');
    expect(input).toBeTruthy();

    act(() => {
      window.dispatchEvent(new Event(FOCUS_TRANSLATION_URL_INPUT_EVENT));
    });

    expect(document.activeElement).toBe(input);
    expect(input?.selectionStart).toBe(0);
    expect(input?.selectionEnd).toBe('https://example.com/novel/1'.length);
  });
});
