import { describe, expect, it, vi } from 'vitest';
import { loadWatchlistOnStartupFlow } from './useWatchlist';
import { useSeriesStore } from '../stores/seriesStore';

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
