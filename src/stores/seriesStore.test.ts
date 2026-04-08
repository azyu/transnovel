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
    useSeriesStore.getState().setSelectedWatchlistNovelId('syosetu:n3645ly');
    useSeriesStore.getState().setWatchlistEpisodes([
      {
        chapterNumber: 1,
        chapterUrl: 'https://ncode.syosetu.com/n3645ly/1/',
        title: '1화',
        isNew: false,
        isViewed: true,
      },
    ]);

    expect(useSeriesStore.getState().selectedWatchlistNovelId).toBe('syosetu:n3645ly');
    expect(useSeriesStore.getState().watchlistEpisodes).toHaveLength(1);
  });

  it('marks a viewed episode only for the matching novel and updates unread counts', () => {
    useSeriesStore.getState().setWatchlistItems([
      {
        novelId: 'n1',
        title: '첫 작품',
        site: 'syosetu',
        workUrl: 'https://ncode.syosetu.com/n1/',
        author: null,
        lastKnownChapter: 3,
        lastCheckedAt: null,
        lastCheckStatus: 'ok',
        lastCheckError: null,
        newEpisodeCount: 1,
      },
      {
        novelId: 'n2',
        title: '둘째 작품',
        site: 'syosetu',
        workUrl: 'https://ncode.syosetu.com/n2/',
        author: null,
        lastKnownChapter: 5,
        lastCheckedAt: null,
        lastCheckStatus: 'ok',
        lastCheckError: null,
        newEpisodeCount: 1,
      },
    ]);
    useSeriesStore.getState().setSelectedWatchlistNovelId('syosetu:n1');
    useSeriesStore.getState().setWatchlistEpisodes([
      {
        chapterNumber: 2,
        chapterUrl: 'https://ncode.syosetu.com/n1/2/',
        title: '2화',
        isNew: true,
        isViewed: false,
      },
      {
        chapterNumber: 5,
        chapterUrl: 'https://ncode.syosetu.com/n1/5/',
        title: '5화',
        isNew: false,
        isViewed: false,
      },
    ]);

    useSeriesStore.getState().markWatchlistEpisodeViewed('syosetu', 'n2', 2, 0);

    expect(useSeriesStore.getState().watchlistEpisodes).toEqual([
      {
        chapterNumber: 2,
        chapterUrl: 'https://ncode.syosetu.com/n1/2/',
        title: '2화',
        isNew: true,
        isViewed: false,
      },
      {
        chapterNumber: 5,
        chapterUrl: 'https://ncode.syosetu.com/n1/5/',
        title: '5화',
        isNew: false,
        isViewed: false,
      },
    ]);
    expect(useSeriesStore.getState().watchlistItems.map((item) => item.newEpisodeCount)).toEqual([1, 0]);
    expect(useSeriesStore.getState().watchlistBadgeCount).toBe(1);

    useSeriesStore.getState().markWatchlistEpisodeViewed('syosetu', 'n1', 2, 0);

    expect(useSeriesStore.getState().watchlistEpisodes).toEqual([
      {
        chapterNumber: 2,
        chapterUrl: 'https://ncode.syosetu.com/n1/2/',
        title: '2화',
        isNew: false,
        isViewed: true,
      },
      {
        chapterNumber: 5,
        chapterUrl: 'https://ncode.syosetu.com/n1/5/',
        title: '5화',
        isNew: false,
        isViewed: false,
      },
    ]);
    expect(useSeriesStore.getState().watchlistItems.map((item) => item.newEpisodeCount)).toEqual([0, 0]);
    expect(useSeriesStore.getState().watchlistBadgeCount).toBe(0);
  });

  it('keeps watchlist selection scoped by site when novel ids overlap', () => {
    useSeriesStore.getState().setWatchlistItems([
      {
        novelId: 'n1000aa',
        title: '일반 작품',
        site: 'syosetu',
        workUrl: 'https://ncode.syosetu.com/n1000aa/',
        author: null,
        lastKnownChapter: 1,
        lastCheckedAt: null,
        lastCheckStatus: 'ok',
        lastCheckError: null,
        newEpisodeCount: 0,
      },
      {
        novelId: 'n1000aa',
        title: 'R18 작품',
        site: 'nocturne',
        workUrl: 'https://novel18.syosetu.com/n1000aa/',
        author: null,
        lastKnownChapter: 1,
        lastCheckedAt: null,
        lastCheckStatus: 'ok',
        lastCheckError: null,
        newEpisodeCount: 1,
      },
    ]);
    useSeriesStore.getState().setSelectedWatchlistNovelId('nocturne:n1000aa');
    useSeriesStore.getState().setWatchlistEpisodes([
      {
        chapterNumber: 1,
        chapterUrl: 'https://novel18.syosetu.com/n1000aa/1/',
        title: '1화',
        isNew: true,
        isViewed: false,
      },
    ]);

    useSeriesStore.getState().markWatchlistEpisodeViewed('syosetu', 'n1000aa', 1, 0);

    expect(useSeriesStore.getState().watchlistEpisodes[0]).toEqual({
      chapterNumber: 1,
      chapterUrl: 'https://novel18.syosetu.com/n1000aa/1/',
      title: '1화',
      isNew: true,
      isViewed: false,
    });
    expect(useSeriesStore.getState().watchlistItems.map((item) => item.newEpisodeCount)).toEqual([0, 1]);
  });
});
