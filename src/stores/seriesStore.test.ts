import { beforeEach, describe, expect, it } from 'vitest';
import { useSeriesStore } from './seriesStore';

describe('useSeriesStore watchlist state', () => {
  beforeEach(() => {
    useSeriesStore.setState({
      watchlistItems: [],
      selectedWatchlistNovelId: null,
      watchlistEpisodes: [],
      isRefreshingWatchlist: false,
      watchlistLoaded: false,
      watchlistError: null,
      watchlistBadgeCount: 0,
      chapterList: [],
      batchProgress: null,
      novelMetadata: null,
    });
  });

  it('tracks badge count from works with new episodes', () => {
    useSeriesStore.getState().setWatchlistItems([
      {
        novelId: 'n1',
        title: '첫 작품',
        site: 'syosetu',
        workUrl: 'https://ncode.syosetu.com/n1/',
        author: null,
        lastKnownChapter: 2,
        lastCheckedAt: null,
        lastCheckStatus: 'ok',
        lastCheckError: null,
        newEpisodeCount: 0,
      },
      {
        novelId: 'n2',
        title: '둘째 작품',
        site: 'syosetu',
        workUrl: 'https://ncode.syosetu.com/n2/',
        author: null,
        lastKnownChapter: 3,
        lastCheckedAt: null,
        lastCheckStatus: 'ok',
        lastCheckError: null,
        newEpisodeCount: 2,
      },
    ]);

    expect(useSeriesStore.getState().watchlistBadgeCount).toBe(1);
  });

  it('updates selected work and episode rows independently', () => {
    useSeriesStore.getState().setSelectedWatchlistNovelId('n3645ly');
    useSeriesStore.getState().setWatchlistEpisodes([
      {
        chapterNumber: 1,
        chapterUrl: 'https://ncode.syosetu.com/n3645ly/1/',
        title: '1화',
        isNew: false,
        isViewed: true,
      },
    ]);

    expect(useSeriesStore.getState().selectedWatchlistNovelId).toBe('n3645ly');
    expect(useSeriesStore.getState().watchlistEpisodes).toHaveLength(1);
  });
});
