import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslationView } from './TranslationView';
import { useUIStore } from '../../stores/uiStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { useTranslationStore } from '../../stores/translationStore';

const invokeMock = vi.fn(async (command: string) => {
  if (command === 'get_settings') {
    return [
      { key: 'active_model_id', value: 'model-1' },
      { key: 'llm_models', value: JSON.stringify([{ id: 'model-1', providerId: 'provider-1' }]) },
      { key: 'llm_providers', value: JSON.stringify([{ id: 'provider-1' }]) },
    ];
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
  CharacterDictionaryModal: () => null,
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

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useUIStore.setState({
      currentTab: 'translation',
      theme: 'dark',
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
    });

    useTranslationStore.setState({
      currentUrl: 'https://novel18.syosetu.com/n0112ma/2/',
      chapter: {
        site: 'nocturne',
        novelId: 'n0112ma',
        novelTitle: '등록된 작품',
        chapterNumber: 2,
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
});
