import { describe, expect, it, vi } from 'vitest';
import { loadWatchlistEpisodesFlow, loadWatchlistOnStartupFlow, refreshWatchlistFlow } from './useWatchlist';
import { useSeriesStore } from '../stores/seriesStore';
import { getWatchlistItemKey } from '../utils/watchlist';

describe('loadWatchlistOnStartupFlow', () => {
  it('loads items first and then applies background refresh results', async () => {
    const invokeMock = vi.fn(async (command: string) => {
      if (command === 'list_watchlist_items') {
        return [
          {
            novelId: 'n3645ly',
            title: '작품',
            site: 'syosetu',
            workUrl: 'https://ncode.syosetu.com/n3645ly/',
            author: null,
            lastKnownChapter: 2,
            lastCheckedAt: null,
            lastCheckStatus: 'ok',
            lastCheckError: null,
            newEpisodeCount: 0,
          },
        ];
      }

      if (command === 'refresh_watchlist') {
        return [
          {
            novelId: 'n3645ly',
            title: '작품',
            site: 'syosetu',
            workUrl: 'https://ncode.syosetu.com/n3645ly/',
            author: null,
            lastKnownChapter: 3,
            lastCheckedAt: '2026-04-08 23:00:00',
            lastCheckStatus: 'ok',
            lastCheckError: null,
            newEpisodeCount: 1,
          },
        ];
      }

      return [];
    });

    useSeriesStore.setState({
      watchlistItems: [],
      selectedWatchlistNovelId: null,
      watchlistEpisodes: [],
      isRefreshingWatchlist: false,
      watchlistLoaded: false,
      watchlistError: null,
      watchlistBadgeCount: 0,
    });

    await loadWatchlistOnStartupFlow(invokeMock as never, {
      setWatchlistItems: useSeriesStore.getState().setWatchlistItems,
      setWatchlistLoaded: useSeriesStore.getState().setWatchlistLoaded,
      setIsRefreshingWatchlist: useSeriesStore.getState().setIsRefreshingWatchlist,
      setWatchlistError: useSeriesStore.getState().setWatchlistError,
    });

    expect(invokeMock).toHaveBeenCalledWith('list_watchlist_items');
    expect(invokeMock).toHaveBeenCalledWith('refresh_watchlist');
    expect(useSeriesStore.getState().watchlistLoaded).toBe(true);
    expect(useSeriesStore.getState().watchlistBadgeCount).toBe(1);
    expect(useSeriesStore.getState().watchlistItems[0]?.lastKnownChapter).toBe(3);
    expect(useSeriesStore.getState().isRefreshingWatchlist).toBe(false);
  });
});

describe('loadWatchlistEpisodesFlow', () => {
  it('does not apply a stale response when shouldApply returns false', async () => {
    const invokeMock = vi.fn(async () => [
      {
        chapterNumber: 2,
        chapterUrl: 'https://ncode.syosetu.com/n9999zz/2/',
        title: '2화',
        isNew: true,
        isViewed: false,
      },
    ]);

    useSeriesStore.setState({
      watchlistItems: [],
      selectedWatchlistNovelId: 'syosetu:n1234ab',
      watchlistEpisodes: [
        {
          chapterNumber: 1,
          chapterUrl: 'https://ncode.syosetu.com/n1234ab/1/',
          title: '1화',
          isNew: false,
          isViewed: true,
        },
      ],
      isRefreshingWatchlist: false,
      watchlistLoaded: true,
      watchlistError: null,
      watchlistBadgeCount: 0,
    });

    const episodes = await loadWatchlistEpisodesFlow(
      invokeMock as never,
      {
        setSelectedWatchlistNovelId: useSeriesStore.getState().setSelectedWatchlistNovelId,
        setWatchlistEpisodes: useSeriesStore.getState().setWatchlistEpisodes,
      },
      'syosetu',
      'n9999zz',
      {
        shouldApply: () => false,
      },
    );

    expect(episodes).toHaveLength(1);
    expect(useSeriesStore.getState().selectedWatchlistNovelId).toBe('syosetu:n1234ab');
    expect(useSeriesStore.getState().watchlistEpisodes).toEqual([
      {
        chapterNumber: 1,
        chapterUrl: 'https://ncode.syosetu.com/n1234ab/1/',
        title: '1화',
        isNew: false,
        isViewed: true,
      },
    ]);
  });

  it('applies episodes when shouldApply returns true', async () => {
    const invokeMock = vi.fn(async () => [
      {
        chapterNumber: 2,
        chapterUrl: 'https://ncode.syosetu.com/n9999zz/2/',
        title: '2화',
        isNew: true,
        isViewed: false,
      },
    ]);

    useSeriesStore.setState({
      watchlistItems: [],
      selectedWatchlistNovelId: null,
      watchlistEpisodes: [],
      isRefreshingWatchlist: false,
      watchlistLoaded: true,
      watchlistError: null,
      watchlistBadgeCount: 0,
    });

    await loadWatchlistEpisodesFlow(
      invokeMock as never,
      {
        setSelectedWatchlistNovelId: useSeriesStore.getState().setSelectedWatchlistNovelId,
        setWatchlistEpisodes: useSeriesStore.getState().setWatchlistEpisodes,
      },
      'syosetu',
      'n9999zz',
      {
        shouldApply: () => true,
      },
    );

    expect(useSeriesStore.getState().selectedWatchlistNovelId).toBe(getWatchlistItemKey('syosetu', 'n9999zz'));
    expect(useSeriesStore.getState().watchlistEpisodes).toEqual([
      {
        chapterNumber: 2,
        chapterUrl: 'https://ncode.syosetu.com/n9999zz/2/',
        title: '2화',
        isNew: true,
        isViewed: false,
      },
    ]);
  });
});

describe('refreshWatchlistFlow', () => {
  it('does not apply refreshed items when shouldApply returns false', async () => {
    const invokeMock = vi.fn(async () => [
      {
        novelId: 'n9999zz',
        title: '새 작품',
        site: 'syosetu',
        workUrl: 'https://ncode.syosetu.com/n9999zz/',
        author: null,
        lastKnownChapter: 4,
        lastCheckedAt: '2026-04-11 10:00:00',
        lastCheckStatus: 'ok',
        lastCheckError: null,
        newEpisodeCount: 2,
      },
    ]);

    useSeriesStore.setState({
      watchlistItems: [
        {
          novelId: 'n1234ab',
          title: '기존 작품',
          site: 'syosetu',
          workUrl: 'https://ncode.syosetu.com/n1234ab/',
          author: null,
          lastKnownChapter: 1,
          lastCheckedAt: null,
          lastCheckStatus: 'ok',
          lastCheckError: null,
          newEpisodeCount: 0,
        },
      ],
      selectedWatchlistNovelId: 'syosetu:n1234ab',
      watchlistEpisodes: [],
      isRefreshingWatchlist: false,
      watchlistLoaded: true,
      watchlistError: null,
      watchlistBadgeCount: 0,
    });

    await refreshWatchlistFlow(
      invokeMock as never,
      {
        setWatchlistItems: useSeriesStore.getState().setWatchlistItems,
        setIsRefreshingWatchlist: useSeriesStore.getState().setIsRefreshingWatchlist,
        setWatchlistError: useSeriesStore.getState().setWatchlistError,
        showError: vi.fn(),
      },
      {
        shouldApply: () => false,
      },
    );

    expect(useSeriesStore.getState().watchlistItems).toEqual([
      {
        novelId: 'n1234ab',
        title: '기존 작품',
        site: 'syosetu',
        workUrl: 'https://ncode.syosetu.com/n1234ab/',
        author: null,
        lastKnownChapter: 1,
        lastCheckedAt: null,
        lastCheckStatus: 'ok',
        lastCheckError: null,
        newEpisodeCount: 0,
      },
    ]);
    expect(useSeriesStore.getState().isRefreshingWatchlist).toBe(false);
  });
});
