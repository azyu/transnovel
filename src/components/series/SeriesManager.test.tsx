import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeriesManager } from './SeriesManager';
import { messages } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { useTranslationStore } from '../../stores/translationStore';
import { getWatchlistItemKey } from '../../utils/watchlist';

const parseAndTranslate = vi.fn();
const addWatchlistItem = vi.fn();
const removeWatchlistItem = vi.fn(async (site: string, novelId: string) => {
  useSeriesStore.getState().removeWatchlistItem(site, novelId);
});
const loadWatchlistEpisodes = vi.fn<
  (site: string, novelId: string, options: { shouldApply: () => boolean }) => Promise<never[]>
>(async () => []);
const refreshWatchlist = vi.fn(async () => {});
const { askConfirmation } = vi.hoisted(() => ({
  askConfirmation: vi.fn(async () => true),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  ask: askConfirmation,
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    parseAndTranslate,
  }),
}));

vi.mock('../../hooks/useWatchlist', () => ({
  useWatchlist: () => ({
    addWatchlistItem,
    removeWatchlistItem,
    loadWatchlistEpisodes,
    refreshWatchlist,
  }),
}));

describe('SeriesManager', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalSeriesMessages: unknown;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    askConfirmation.mockResolvedValue(true);
    originalSeriesMessages = messages.series;

    useUIStore.setState({
      currentTab: 'series',
      theme: 'dark',
      language: 'ko',
      toast: null,
    });

    useTranslationStore.setState({
      currentUrl: '',
    });

    const item = {
      site: 'syosetu',
      workUrl: 'https://ncode.syosetu.com/n1234ab/',
      novelId: 'n1234ab',
      title: '테스트 작품',
      author: '테스트 작가',
      lastKnownChapter: 12,
      lastCheckedAt: null,
      lastCheckStatus: 'ok',
      lastCheckError: null,
      newEpisodeCount: 1,
    };

    useSeriesStore.setState({
      watchlistItems: [item],
      selectedWatchlistNovelId: getWatchlistItemKey(item),
      watchlistEpisodes: [],
      isRefreshingWatchlist: false,
      watchlistLoaded: true,
      watchlistError: null,
      watchlistBadgeCount: 1,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    (messages as { series: unknown }).series = originalSeriesMessages;
    vi.clearAllMocks();
  });

  it('shows the count badge without duplicating a new-episode status label on the card', async () => {
    await act(async () => {
      root.render(<SeriesManager />);
    });

    const countBadges = Array.from(container.querySelectorAll('span')).filter(
      (element) => element.textContent?.trim() === '1',
    );

    expect(container.textContent).toContain('테스트 작품');
    expect(countBadges.length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('새 화 1개');
  });

  it('removes a watchlist item and clears its selection after confirmation', async () => {
    await act(async () => {
      root.render(<SeriesManager />);
    });

    const removeButton = container.querySelector(
      'button[aria-label="테스트 작품 관심작품에서 삭제"]',
    );
    expect(removeButton).toBeTruthy();

    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(askConfirmation).toHaveBeenCalledWith(
      '"테스트 작품"을(를) 관심작품에서 삭제하시겠습니까?\n\n등록 정보와 새 화 확인 상태가 삭제됩니다.',
      {
        title: '관심작품 삭제',
        kind: 'warning',
      },
    );
    expect(removeWatchlistItem).toHaveBeenCalledWith('syosetu', 'n1234ab');
    expect(useSeriesStore.getState().watchlistItems).toEqual([]);
    expect(useSeriesStore.getState().selectedWatchlistNovelId).toBeNull();
    expect(useSeriesStore.getState().watchlistEpisodes).toEqual([]);
  });
  it('keeps a watchlist item when removal is cancelled', async () => {
    askConfirmation.mockResolvedValue(false);

    await act(async () => {
      root.render(<SeriesManager />);
    });

    const removeButton = container.querySelector(
      'button[aria-label="테스트 작품 관심작품에서 삭제"]',
    );
    expect(removeButton).toBeTruthy();

    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(removeWatchlistItem).not.toHaveBeenCalled();
    expect(useSeriesStore.getState().watchlistItems).toHaveLength(1);
    expect(useSeriesStore.getState().selectedWatchlistNovelId).toBe('syosetu:n1234ab');
  });



  it('disables watchlist deletion while the list is refreshing', async () => {
    useSeriesStore.setState({ isRefreshingWatchlist: true });

    await act(async () => {
      root.render(<SeriesManager />);
    });

    const removeButton = container.querySelector(
      'button[aria-label="테스트 작품 관심작품에서 삭제"]',
    ) as HTMLButtonElement | null;
    expect(removeButton).toBeTruthy();
    expect(removeButton?.disabled).toBe(true);
  });
  it('invalidates a pending episode selection when its work is deleted', async () => {
    const otherItem = {
      site: 'kakuyomu',
      workUrl: 'https://kakuyomu.jp/works/123',
      novelId: '123',
      title: '다른 작품',
      author: '다른 작가',
      lastKnownChapter: 4,
      lastCheckedAt: null,
      lastCheckStatus: 'ok',
      lastCheckError: null,
      newEpisodeCount: 0,
    };
    useSeriesStore.setState({
      watchlistItems: [useSeriesStore.getState().watchlistItems[0], otherItem],
      selectedWatchlistNovelId: 'syosetu:n1234ab',
    });

    let resolveSelection!: () => void;
    let pendingSelectionOptions: { shouldApply: () => boolean } | undefined;
    const selectionPending = new Promise<void>((resolve) => {
      resolveSelection = resolve;
    });
    loadWatchlistEpisodes.mockImplementationOnce(
      async (
        _site: string,
        _novelId: string,
        options: { shouldApply: () => boolean },
      ) => {
        pendingSelectionOptions = options;
        await selectionPending;
        return [];
      },
    );

    await act(async () => {
      root.render(<SeriesManager />);
    });

    const otherNovelButton = Array.from(container.querySelectorAll('button')).find(
      (element) => element.textContent?.includes('다른 작품'),
    );
    expect(otherNovelButton).toBeTruthy();
    await act(async () => {
      otherNovelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const removeButton = container.querySelector(
      'button[aria-label="다른 작품 관심작품에서 삭제"]',
    );
    expect(removeButton).toBeTruthy();
    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(pendingSelectionOptions).toBeDefined();
    expect(pendingSelectionOptions?.shouldApply()).toBe(false);
    resolveSelection();
    await act(async () => {
      await selectionPending;
    });
  });

  it('ignores an episode response after the manager unmounts', async () => {
    useSeriesStore.setState({ selectedWatchlistNovelId: null });
    let resolveSelection!: () => void;
    let pendingSelectionOptions: { shouldApply: () => boolean } | undefined;
    const selectionPending = new Promise<void>((resolve) => {
      resolveSelection = resolve;
    });
    loadWatchlistEpisodes.mockImplementationOnce(
      async (
        _site: string,
        _novelId: string,
        options: { shouldApply: () => boolean },
      ) => {
        pendingSelectionOptions = options;
        await selectionPending;
        return [];
      },
    );

    await act(async () => {
      root.render(<SeriesManager />);
    });
    expect(pendingSelectionOptions).toBeDefined();

    act(() => {
      root.unmount();
    });
    expect(pendingSelectionOptions?.shouldApply()).toBe(false);

    resolveSelection();
    await act(async () => {
      await selectionPending;
    });
  });


  it('does not show an empty new-episode status label when there are no new episodes', async () => {
    const item = {
      site: 'syosetu',
      workUrl: 'https://ncode.syosetu.com/n5678cd/',
      novelId: 'n5678cd',
      title: '완결 테스트 작품',
      author: '테스트 작가',
      lastKnownChapter: 8,
      lastCheckedAt: null,
      lastCheckStatus: 'ok',
      lastCheckError: null,
      newEpisodeCount: 0,
    };

    useSeriesStore.setState({
      watchlistItems: [item],
      selectedWatchlistNovelId: getWatchlistItemKey(item),
      watchlistEpisodes: [],
      isRefreshingWatchlist: false,
      watchlistLoaded: true,
      watchlistError: null,
      watchlistBadgeCount: 0,
    });

    await act(async () => {
      root.render(<SeriesManager />);
    });

    expect(container.textContent).toContain('완결 테스트 작품');
    expect(container.textContent).not.toContain('새 화 없음');
  });

  it('renders watchlist-surface copy in English when the UI language is English', async () => {
    useUIStore.setState({ language: 'en' });

    await act(async () => {
      root.render(<SeriesManager />);
    });

    expect(container.textContent).toContain('Watchlist');
    expect(container.textContent).toContain('Refresh');
    expect(container.textContent).toContain('Add to watchlist');
  });

  it('shows an error badge in the top slot without rendering a separate failure label', async () => {
    const item = {
      site: 'syosetu',
      workUrl: 'https://ncode.syosetu.com/n9999zz/',
      novelId: 'n9999zz',
      title: '오류 테스트 작품',
      author: '테스트 작가',
      lastKnownChapter: 3,
      lastCheckedAt: null,
      lastCheckStatus: 'error',
      lastCheckError: 'timeout',
      newEpisodeCount: 0,
    };

    useSeriesStore.setState({
      watchlistItems: [item],
      selectedWatchlistNovelId: getWatchlistItemKey(item),
      watchlistEpisodes: [],
      isRefreshingWatchlist: false,
      watchlistLoaded: true,
      watchlistError: null,
      watchlistBadgeCount: 0,
    });

    await act(async () => {
      root.render(<SeriesManager />);
    });

    const errorBadges = Array.from(container.querySelectorAll('span')).filter(
      (element) => element.textContent?.trim() === '!',
    );

    expect(container.textContent).toContain('오류 테스트 작품');
    expect(errorBadges.length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('확인 실패');
  });

  it('does not switch to a different watchlist novel while the current novel is translating', async () => {
    const currentItem = {
      site: 'syosetu',
      workUrl: 'https://ncode.syosetu.com/n1234ab/',
      novelId: 'n1234ab',
      title: '현재 번역 중인 작품',
      author: '테스트 작가',
      lastKnownChapter: 12,
      lastCheckedAt: null,
      lastCheckStatus: 'ok',
      lastCheckError: null,
      newEpisodeCount: 0,
    };
    const otherItem = {
      site: 'kakuyomu',
      workUrl: 'https://kakuyomu.jp/works/123',
      novelId: '123',
      title: '다른 작품',
      author: '다른 작가',
      lastKnownChapter: 4,
      lastCheckedAt: null,
      lastCheckStatus: 'ok',
      lastCheckError: null,
      newEpisodeCount: 0,
    };

    useSeriesStore.setState({
      watchlistItems: [currentItem, otherItem],
      selectedWatchlistNovelId: getWatchlistItemKey(currentItem),
      watchlistEpisodes: [],
      isRefreshingWatchlist: false,
      watchlistLoaded: true,
      watchlistError: null,
      watchlistBadgeCount: 0,
    });

    useTranslationStore.setState({
      isTranslating: true,
      chapter: {
        site: currentItem.site,
        novelId: currentItem.novelId,
        novelTitle: currentItem.title,
        chapterNumber: 1,
        contentHash: 'test-content-hash',
        title: '1화',
        subtitle: '',
        prevUrl: null,
        nextUrl: null,
        sourceUrl: 'https://ncode.syosetu.com/n1234ab/1/',
      },
    });

    await act(async () => {
      root.render(<SeriesManager />);
    });

    const otherNovelButton = Array.from(container.querySelectorAll('button')).find(
      (element) => element.textContent?.includes('다른 작품'),
    );

    expect(otherNovelButton).toBeTruthy();

    await act(async () => {
      otherNovelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(loadWatchlistEpisodes).not.toHaveBeenCalledWith(otherItem.site, otherItem.novelId);
    expect(useUIStore.getState().toast).toEqual({
      message: '현재 소설이 번역 중이므로 다른 작품이나 화로 이동할 수 없습니다.',
      type: 'error',
      detail: undefined,
    });
  });

  it('does not change the translation url when another episode is clicked during translation', async () => {
    const currentItem = {
      site: 'nocturne',
      workUrl: 'https://novel18.syosetu.com/n0112ma/',
      novelId: 'n0112ma',
      title: '현재 번역 중인 소설',
      author: '테스트 작가',
      lastKnownChapter: 4,
      lastCheckedAt: null,
      lastCheckStatus: 'ok',
      lastCheckError: null,
      newEpisodeCount: 0,
    };

    useSeriesStore.setState({
      watchlistItems: [currentItem],
      selectedWatchlistNovelId: getWatchlistItemKey(currentItem),
      watchlistEpisodes: [
        {
          chapterNumber: 2,
          chapterUrl: 'https://novel18.syosetu.com/n0112ma/2/',
          title: '2화',
          isNew: false,
          isViewed: false,
        },
      ],
      isRefreshingWatchlist: false,
      watchlistLoaded: true,
      watchlistError: null,
      watchlistBadgeCount: 0,
    });

    useTranslationStore.setState({
      currentUrl: 'https://novel18.syosetu.com/n0112ma/4/',
      isTranslating: true,
      chapter: {
        site: currentItem.site,
        novelId: currentItem.novelId,
        novelTitle: currentItem.title,
        chapterNumber: 4,
        contentHash: 'test-content-hash',
        title: '4화',
        subtitle: '',
        prevUrl: 'https://novel18.syosetu.com/n0112ma/3/',
        nextUrl: null,
        sourceUrl: 'https://novel18.syosetu.com/n0112ma/4/',
      },
    });

    await act(async () => {
      root.render(<SeriesManager />);
    });

    const episodeButton = Array.from(container.querySelectorAll('button')).find(
      (element) => element.textContent?.includes('2화'),
    );

    expect(episodeButton).toBeTruthy();

    await act(async () => {
      episodeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useTranslationStore.getState().currentUrl).toBe('https://novel18.syosetu.com/n0112ma/4/');
    expect(parseAndTranslate).not.toHaveBeenCalledWith('https://novel18.syosetu.com/n0112ma/2/');
    expect(useUIStore.getState().toast).toEqual({
      message: '현재 소설이 번역 중이므로 다른 작품이나 화로 이동할 수 없습니다.',
      type: 'error',
      detail: undefined,
    });
  });

  it('does not refresh the watchlist while the current novel is translating', async () => {
    useTranslationStore.setState({
      isTranslating: true,
      chapter: {
        site: 'syosetu',
        novelId: 'n1234ab',
        novelTitle: '현재 번역 중인 작품',
        chapterNumber: 1,
        contentHash: 'test-content-hash',
        title: '1화',
        subtitle: '',
        prevUrl: null,
        nextUrl: null,
        sourceUrl: 'https://ncode.syosetu.com/n1234ab/1/',
      },
    });

    await act(async () => {
      root.render(<SeriesManager />);
    });

    const refreshButton = Array.from(container.querySelectorAll('button')).find(
      (element) => element.textContent?.includes('새로고침'),
    );

    expect(refreshButton).toBeTruthy();

    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(refreshWatchlist).not.toHaveBeenCalled();
    expect(loadWatchlistEpisodes).not.toHaveBeenCalled();
    expect(useUIStore.getState().toast).toEqual({
      message: '현재 소설이 번역 중이므로 다른 작품이나 화로 이동할 수 없습니다.',
      type: 'error',
      detail: undefined,
    });
  });

  it('passes a live apply guard so in-flight watchlist selections are ignored once translation starts', async () => {
    const currentItem = {
      site: 'syosetu',
      workUrl: 'https://ncode.syosetu.com/n1234ab/',
      novelId: 'n1234ab',
      title: '현재 작품',
      author: '테스트 작가',
      lastKnownChapter: 12,
      lastCheckedAt: null,
      lastCheckStatus: 'ok',
      lastCheckError: null,
      newEpisodeCount: 0,
    };
    const otherItem = {
      site: 'kakuyomu',
      workUrl: 'https://kakuyomu.jp/works/123',
      novelId: '123',
      title: '다른 작품',
      author: '다른 작가',
      lastKnownChapter: 4,
      lastCheckedAt: null,
      lastCheckStatus: 'ok',
      lastCheckError: null,
      newEpisodeCount: 0,
    };

    useSeriesStore.setState({
      watchlistItems: [currentItem, otherItem],
      selectedWatchlistNovelId: getWatchlistItemKey(currentItem),
      watchlistEpisodes: [],
      isRefreshingWatchlist: false,
      watchlistLoaded: true,
      watchlistError: null,
      watchlistBadgeCount: 0,
    });

    useTranslationStore.setState({
      isTranslating: false,
      chapter: {
        site: currentItem.site,
        novelId: currentItem.novelId,
        novelTitle: currentItem.title,
        chapterNumber: 1,
        contentHash: 'test-content-hash',
        title: '1화',
        subtitle: '',
        prevUrl: null,
        nextUrl: null,
        sourceUrl: 'https://ncode.syosetu.com/n1234ab/1/',
      },
    });

    await act(async () => {
      root.render(<SeriesManager />);
    });

    const otherNovelButton = Array.from(container.querySelectorAll('button')).find(
      (element) => element.textContent?.includes('다른 작품'),
    );

    expect(otherNovelButton).toBeTruthy();

    await act(async () => {
      otherNovelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const lastCall = loadWatchlistEpisodes.mock.calls.at(-1) as
      | [string, string, { shouldApply: () => boolean }]
      | undefined;

    expect(lastCall).toBeDefined();
    if (!lastCall) {
      throw new Error('loadWatchlistEpisodes was not called');
    }

    const [calledSite, calledNovelId, options] = lastCall;

    expect(calledSite).toBe(otherItem.site);
    expect(calledNovelId).toBe(otherItem.novelId);
    expect(typeof options.shouldApply).toBe('function');

    act(() => {
      useTranslationStore.setState({ isTranslating: true });
    });

    expect(options.shouldApply()).toBe(false);
  });

  it('passes a live apply guard so in-flight refreshes are ignored once translation starts', async () => {
    useTranslationStore.setState({
      isTranslating: false,
      chapter: {
        site: 'syosetu',
        novelId: 'n1234ab',
        novelTitle: '현재 작품',
        chapterNumber: 1,
        contentHash: 'test-content-hash',
        title: '1화',
        subtitle: '',
        prevUrl: null,
        nextUrl: null,
        sourceUrl: 'https://ncode.syosetu.com/n1234ab/1/',
      },
    });

    await act(async () => {
      root.render(<SeriesManager />);
    });

    const refreshButton = Array.from(container.querySelectorAll('button')).find(
      (element) => element.textContent?.includes('새로고침'),
    );

    expect(refreshButton).toBeTruthy();

    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const lastCall = refreshWatchlist.mock.calls.at(-1) as
      | [{ shouldApply: () => boolean }]
      | undefined;

    expect(lastCall).toBeDefined();
    if (!lastCall) {
      throw new Error('refreshWatchlist was not called');
    }

    const [options] = lastCall;

    expect(typeof options.shouldApply).toBe('function');

    act(() => {
      useTranslationStore.setState({ isTranslating: true });
    });

    expect(options.shouldApply()).toBe(false);
  });

  it('renders fallback episode titles from series i18n messages', async () => {
    const originalSeries = originalSeriesMessages as typeof messages.series;
    (messages as { series: unknown }).series = {
      ...originalSeries,
      episodeFallbackTitle: (chapterNumber: number) => `Episode sentinel ${chapterNumber}`,
    };

    const item = {
      site: 'syosetu',
      workUrl: 'https://ncode.syosetu.com/n1234ab/',
      novelId: 'n1234ab',
      title: '테스트 작품',
      author: '테스트 작가',
      lastKnownChapter: 12,
      lastCheckedAt: null,
      lastCheckStatus: 'ok',
      lastCheckError: null,
      newEpisodeCount: 0,
    };

    useSeriesStore.setState({
      watchlistItems: [item],
      selectedWatchlistNovelId: getWatchlistItemKey(item),
      watchlistEpisodes: [
        {
          chapterNumber: 7,
          chapterUrl: 'https://ncode.syosetu.com/n1234ab/7/',
          title: null,
          isNew: false,
          isViewed: false,
        },
      ],
      isRefreshingWatchlist: false,
      watchlistLoaded: true,
      watchlistError: null,
      watchlistBadgeCount: 0,
    });

    await act(async () => {
      root.render(<SeriesManager />);
    });

    expect(container.textContent).toContain('Episode sentinel 7');
  });
});
