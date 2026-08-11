import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UrlInput } from './UrlInput';
import { messages } from '../../i18n';
import { useTranslationStore } from '../../stores/translationStore';
import { useUIStore } from '../../stores/uiStore';
import { getUrlHistory } from '../../utils/urlHistory';
import { FOCUS_TRANSLATION_URL_INPUT_EVENT } from '../../utils/tabShortcuts';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async () => null),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
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
  let originalUrlInputMessages: unknown;
  const getUrlHistoryMock = vi.mocked(getUrlHistory);

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    originalUrlInputMessages = (messages.translation as { urlInput?: unknown }).urlInput;

    useUIStore.setState({ theme: 'dark', language: 'ko' });
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
    (messages.translation as { urlInput?: unknown }).urlInput = originalUrlInputMessages;
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

  it('renders chapter history labels from i18n messages', async () => {
    (messages.translation as { urlInput?: unknown }).urlInput = {
      ...(originalUrlInputMessages as Record<string, unknown>),
      historyChapterLabel: (chapterNumber: number) => `Chapter sentinel ${chapterNumber}`,
    };
    getUrlHistoryMock.mockReturnValue([
      {
        url: 'https://example.com/novel/3',
        novelTitle: 'History title',
        chapterNumber: 3,
      },
    ]);

    await act(async () => {
      root.render(<UrlInput historyKey="test_url_history" />);
    });

    const input = container.querySelector('input');
    expect(input).toBeTruthy();

    act(() => {
      window.dispatchEvent(new Event(FOCUS_TRANSLATION_URL_INPUT_EVENT));
    });

    expect(container.textContent).toContain('Chapter sentinel 3');
  });

  it('renders English translation-surface copy when the UI language is English', async () => {
    useUIStore.setState({ language: 'en' });

    await act(async () => {
      root.render(<UrlInput historyKey="test_url_history" />);
    });

    expect(container.textContent).toContain('Novel URL');
    expect(container.textContent).toContain('Supported sites');
    expect(container.textContent).toContain('Load');
  });

  it('opens the supported Syosetu URL from its site button', async () => {
    await act(async () => {
      root.render(<UrlInput historyKey="test_url_history" />);
    });

    const syosetuButton = Array.from(container.querySelectorAll('button')).find(
      (element) => element.textContent?.trim() === 'ncode.syosetu.com',
    );
    expect(syosetuButton).toBeTruthy();

    act(() => {
      syosetuButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(invokeMock).toHaveBeenCalledWith('open_url', {
      url: 'https://ncode.syosetu.com',
    });
  });
});
