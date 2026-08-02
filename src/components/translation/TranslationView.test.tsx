import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslationView } from './TranslationView';
import { Toast } from '../common/Toast';
import { messages } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { useTranslationStore } from '../../stores/translationStore';

const baseSettings = [
  { key: 'active_model_id', value: 'model-1' },
  { key: 'llm_models', value: JSON.stringify([{ id: 'model-1', providerId: 'provider-1' }]) },
  { key: 'llm_providers', value: JSON.stringify([{ id: 'provider-1' }]) },
];

let getSettingsResponse: { key: string; value: string }[] = baseSettings;
let characterDictionaryModalProps:
  | { title: string; description: string; saveLabel: string }
  | null = null;

const invokeMock = vi.fn(async (command: string) => {
  if (command === 'get_settings') {
    return getSettingsResponse;
  }

  return null;
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string) => invokeMock(command),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  message: vi.fn(async () => {}),
}));

vi.mock('./UrlInput', () => ({
  UrlInput: () => <div data-testid="url-input" />,
}));

vi.mock('./ParagraphList', () => ({
  ParagraphList: () => <div data-testid="paragraph-list" />,
}));

vi.mock('./CharacterDictionaryModal', () => ({
  CharacterDictionaryModal: (props: { title: string; description: string; saveLabel: string }) => {
    characterDictionaryModalProps = props;
    return null;
  },
}));

vi.mock('./SaveModal', () => ({
  SaveModal: () => null,
}));

vi.mock('../common/DebugPanel', () => ({
  DebugPanel: () => null,
}));

const addWatchlistItem = vi.fn(async () => {});

vi.mock('../../hooks/useWatchlist', () => ({
  useWatchlist: () => ({
    addWatchlistItem,
  }),
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    parseAndTranslate: vi.fn(async () => {}),
    retryFailedParagraphs: vi.fn(async () => {}),
    getCharacterDictionary: vi.fn(async () => []),
    saveCharacterDictionary: vi.fn(async () => {}),
  }),
  mergeCharacterDictionaryEntries: (entries: unknown[]) => entries,
  resolveCharacterDictionaryTarget: () => null,
}));

describe('TranslationView', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalNavigationMessages: unknown;
  let originalDictionaryMessages: unknown;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    characterDictionaryModalProps = null;
    getSettingsResponse = baseSettings;
    originalNavigationMessages = (messages.translation as { navigation?: unknown }).navigation;
    originalDictionaryMessages = (messages.translation as { dictionary?: unknown }).dictionary;

    useUIStore.setState({
      currentTab: 'translation',
      theme: 'dark',
      language: 'ko',
      toast: null,
    });

    useSeriesStore.setState({
      watchlistItems: [
        {
          site: 'nocturne',
          workUrl: 'https://novel18.syosetu.com/n0112ma/',
          novelId: 'n0112ma',
          title: '등록된 작품',
          author: '작가',
          lastKnownChapter: 4,
          lastCheckedAt: null,
          lastCheckStatus: 'ok',
          lastCheckError: null,
          newEpisodeCount: 0,
        },
      ],
      watchlistEpisodes: [],
      selectedWatchlistNovelId: null,
      isRefreshingWatchlist: false,
      watchlistLoaded: true,
      watchlistError: null,
      watchlistBadgeCount: 0,
      batchProgress: null,
    });

    useTranslationStore.setState({
      currentUrl: 'https://novel18.syosetu.com/n0112ma/2/',
      chapter: {
        site: 'nocturne',
        novelId: 'n0112ma',
        novelTitle: '등록된 작품',
        chapterNumber: 2,
        contentHash: 'test-content-hash',
        title: '2화',
        subtitle: '',
        prevUrl: 'https://novel18.syosetu.com/n0112ma/1/',
        nextUrl: 'https://novel18.syosetu.com/n0112ma/3/',
        sourceUrl: 'https://novel18.syosetu.com/n0112ma/2/',
      },
      translatedTitle: undefined,
      translatedSubtitle: undefined,
      paragraphIds: ['p-1'],
      paragraphById: {
        'p-1': {
          id: 'p-1',
          original: '원문',
          translated: '번역문',
        },
      },
      translatedCount: 1,
      isTranslating: false,
      failedParagraphIndices: [],
      pendingCharacterDictionaryReview: null,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    (messages.translation as { navigation?: unknown }).navigation = originalNavigationMessages;
    (messages.translation as { dictionary?: unknown }).dictionary = originalDictionaryMessages;
    vi.clearAllMocks();
  });

  it('disables add-to-watchlist button when the current work is already registered', async () => {
    await act(async () => {
      root.render(<TranslationView />);
    });

    const addButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('관심작품에 추가'),
    );

    expect(addButton).toBeTruthy();
    expect(addButton).toHaveProperty('disabled', true);
  });

  it('renders chapter navigation labels from i18n messages', async () => {
    (messages.translation as { navigation?: unknown }).navigation = {
      prevChapter: 'Prev chapter sentinel',
      nextChapter: 'Next chapter sentinel',
    };

    await act(async () => {
      root.render(<TranslationView />);
    });

    expect(
      Array.from(container.querySelectorAll('button')).some((button) =>
        button.textContent?.includes('Prev chapter sentinel'),
      ),
    ).toBe(true);
    expect(
      Array.from(container.querySelectorAll('button')).some((button) =>
        button.textContent?.includes('Next chapter sentinel'),
      ),
    ).toBe(true);
  });

  it('passes dictionary modal copy from i18n messages', async () => {
    (messages.translation as { dictionary?: unknown }).dictionary = {
      ...(originalDictionaryMessages as Record<string, unknown>),
      reviewTitle: 'Dictionary review title sentinel',
      reviewDescription: 'Dictionary review description sentinel',
      manualTitle: 'Dictionary manual title sentinel',
      manualDescription: 'Dictionary manual description sentinel',
      reviewSaveLabel: 'Dictionary review save sentinel',
      manualSaveLabel: 'Dictionary manual save sentinel',
    };

    await act(async () => {
      root.render(<TranslationView />);
    });

    expect(characterDictionaryModalProps).toMatchObject({
      title: 'Dictionary manual title sentinel',
      description: 'Dictionary manual description sentinel',
      saveLabel: 'Dictionary manual save sentinel',
    });
  });

  it('renders original and translated titles with matching sizes in side-by-side layout', async () => {
    getSettingsResponse = [
      ...baseSettings,
      { key: 'view_config', value: JSON.stringify({ displayLayout: 'sideBySide', showOriginal: true }) },
    ];
    useTranslationStore.setState({
      chapter: {
        site: 'nocturne',
        novelId: 'n0112ma',
        novelTitle: '등록된 작품',
        chapterNumber: 2,
        contentHash: 'test-content-hash',
        title: '原文タイトル',
        subtitle: '原文サブタイトル',
        prevUrl: null,
        nextUrl: null,
        sourceUrl: 'https://novel18.syosetu.com/n0112ma/2/',
      },
      translatedTitle: '번역 제목',
      translatedSubtitle: '번역 부제목',
    });

    await act(async () => {
      root.render(<TranslationView />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const layout = container.querySelector('[data-testid="chapter-title-layout"]');
    const originalTitle = container.querySelector('[data-testid="chapter-original-title"]');
    const translatedTitle = container.querySelector('[data-testid="chapter-translated-title"]');
    const originalSubtitle = container.querySelector('[data-testid="chapter-original-subtitle"]');
    const translatedSubtitle = container.querySelector('[data-testid="chapter-translated-subtitle"]');

    expect(layout?.className).toContain('md:grid-cols-2');
    expect(originalTitle?.className).toContain('text-2xl');
    expect(translatedTitle?.className).toContain('text-2xl');
    expect(originalSubtitle?.className).toContain('text-xl');
    expect(translatedSubtitle?.className).toContain('text-xl');
  });

  it('renders original and translated titles in stacked layout', async () => {
    getSettingsResponse = [
      ...baseSettings,
      { key: 'view_config', value: JSON.stringify({ displayLayout: 'stacked', showOriginal: true }) },
    ];
    useTranslationStore.setState({
      translatedTitle: '번역 제목',
      translatedSubtitle: '번역 부제목',
    });

    await act(async () => {
      root.render(<TranslationView />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const layout = container.querySelector('[data-testid="chapter-title-layout"]');

    expect(layout?.className).toContain('space-y-3');
    expect(layout?.className).not.toContain('md:grid-cols-2');
    expect(container.textContent).toContain('2화');
    expect(container.textContent).toContain('번역 제목');
  });

  it('announces translation start once and exposes visible progress values without paragraph live regions', async () => {
    useTranslationStore.setState({
      isTranslating: true,
      translatedCount: 1,
      paragraphIds: ['p-1', 'p-2'],
    });

    await act(async () => {
      root.render(<TranslationView />);
    });

    const status = container.querySelector('[role="status"]');
    const progress = container.querySelector('[role="progressbar"]');
    expect(status?.textContent).toContain('번역 중');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(progress).toHaveAttribute('aria-label', '번역 진행률');
    expect(progress).toHaveAttribute('aria-valuenow', '1');
    expect(progress).toHaveAttribute('aria-valuemax', '2');
    expect(container.querySelectorAll('[aria-live]').length).toBe(1);
  });

  it('defers batch announcement ownership to the global header status', async () => {
    useTranslationStore.setState({
      isTranslating: true,
      translatedCount: 1,
      paragraphIds: ['p-1', 'p-2'],
    });
    useSeriesStore.setState({
      batchProgress: {
        current_chapter: 1,
        total_chapters: 2,
        chapter_title: '제1화',
        status: 'translating',
      },
    });

    await act(async () => {
      root.render(<TranslationView />);
    });

    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('keeps translation progress indeterminate until paragraph IDs are available', async () => {
    useTranslationStore.setState({
      isTranslating: true,
      translatedCount: 0,
      paragraphIds: [],
    });

    await act(async () => {
      root.render(<TranslationView />);
    });

    const progress = container.querySelector('[role="progressbar"]');
    expect(progress).not.toHaveAttribute('aria-valuenow');
    expect(progress).not.toHaveAttribute('aria-valuemax');
  });

  it('keeps a polite stopping announcement until the stop command clears translation state', async () => {
    let resolveStop!: () => void;
    const stopPromise = new Promise<void>((resolve) => {
      resolveStop = resolve;
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_settings') return getSettingsResponse;
      if (command === 'stop_translation') {
        await stopPromise;
        return null;
      }
      return null;
    });
    useTranslationStore.setState({ isTranslating: true });

    await act(async () => {
      root.render(<TranslationView />);
    });

    const stopButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('번역 중지'),
    ) as HTMLButtonElement;
    expect(stopButton).toBeTruthy();

    await act(async () => {
      stopButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(stopButton).toHaveAttribute('aria-busy', 'true');
    expect(stopButton).toBeDisabled();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('중지');

    await act(async () => {
      resolveStop();
      await stopPromise;
      useTranslationStore.setState({ isTranslating: false });
      await Promise.resolve();
    });

    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('leaves terminal success and failure announcements to exactly one global toast', async () => {
    useTranslationStore.setState({ isTranslating: false });
    useUIStore.setState({
      toast: { message: '번역 완료', type: 'success' },
    });

    await act(async () => {
      root.render(
        <>
          <TranslationView />
          <Toast />
        </>,
      );
    });

    expect(document.body.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('번역 완료');

    act(() => {
      useUIStore.setState({
        toast: { message: '번역 실패', detail: '제공자 오류', type: 'error' },
      });
    });

    expect(document.body.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(document.body.querySelectorAll('[role="status"]')).toHaveLength(0);
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('제공자 오류');
  });
});
