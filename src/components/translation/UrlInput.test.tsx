import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UrlInput } from './UrlInput';
import { messages } from '../../i18n';
import { useTranslationStore } from '../../stores/translationStore';
import { useUIStore } from '../../stores/uiStore';
import { getUrlHistory } from '../../utils/urlHistory';
import { FOCUS_TRANSLATION_URL_INPUT_EVENT } from '../../utils/tabShortcuts';

const { parseAndTranslateMock } = vi.hoisted(() => ({
  parseAndTranslateMock: vi.fn(async () => {}),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => null),
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    parseAndTranslate: parseAndTranslateMock,
    parseChapter: vi.fn(async () => {}),
    loading: false,
  }),
}));

vi.mock('../../utils/urlHistory', () => ({
  getUrlHistory: vi.fn(() => []),
  saveUrlHistory: vi.fn(),
}));
const setInputValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};


describe('UrlInput', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalUrlInputMessages: unknown;
  const getUrlHistoryMock = vi.mocked(getUrlHistory);

  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

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

    await act(async () => {
      window.dispatchEvent(new Event(FOCUS_TRANSLATION_URL_INPUT_EVENT));
      await Promise.resolve();
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

    await act(async () => {
      window.dispatchEvent(new Event(FOCUS_TRANSLATION_URL_INPUT_EVENT));
      await Promise.resolve();
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

  it('exposes history as a combobox listbox and supports keyboard-only selection', async () => {
    getUrlHistoryMock.mockReturnValue([
      { url: 'https://example.com/novel/1', novelTitle: '첫 작품', chapterNumber: 1 },
      { url: 'https://example.com/novel/2', novelTitle: '두 번째 작품', chapterNumber: 2 },
    ]);
    useTranslationStore.setState({ currentUrl: '' });

    await act(async () => {
      root.render(<UrlInput historyKey="test_url_history" />);
    });

    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      input.focus();
      await Promise.resolve();
    });

    expect(input).toHaveAttribute('role', 'combobox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('[role="listbox"]')).toBeTruthy();
    const loadButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '불러오기',
    );
    expect(loadButton).not.toHaveAttribute('inert');
    expect(loadButton).not.toHaveAttribute('aria-hidden');

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      await Promise.resolve();
    });
    expect(input.value).toBe('https://example.com/novel/2');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('edits a history URL and submits the arbitrary value with one Enter', async () => {
    getUrlHistoryMock.mockReturnValue([
      { url: 'https://example.com/novel/1', novelTitle: '첫 작품', chapterNumber: 1 },
    ]);


    await act(async () => {
      root.render(<UrlInput historyKey="test_url_history" />);
    });

    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      window.dispatchEvent(new Event(FOCUS_TRANSLATION_URL_INPUT_EVENT));
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    await act(async () => {
      setInputValue(input, 'https://new.example.com/free-form');
      await Promise.resolve();
    });
    expect(input.value).toBe('https://new.example.com/free-form');


    const form = container.querySelector('form');
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      await Promise.resolve();
    });

    expect(form).toBeTruthy();
    expect(parseAndTranslateMock).toHaveBeenCalledTimes(1);
    expect(parseAndTranslateMock).toHaveBeenCalledWith('https://new.example.com/free-form');
    expect(input).toHaveAttribute('aria-expanded', 'false');

    await act(async () => {
      window.dispatchEvent(new Event(FOCUS_TRANSLATION_URL_INPUT_EVENT));
      await Promise.resolve();
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
      await Promise.resolve();
    });
    expect(input.value).toBe('https://new.example.com/free-form');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });
});
