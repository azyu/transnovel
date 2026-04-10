import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeriesManager } from './SeriesManager';
import { useUIStore } from '../../stores/uiStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { useTranslationStore } from '../../stores/translationStore';
import { getWatchlistItemKey } from '../../utils/watchlist';

const parseAndTranslate = vi.fn();
const addWatchlistItem = vi.fn();
const loadWatchlistEpisodes = vi.fn(async () => []);
const refreshWatchlist = vi.fn(async () => {});

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    parseAndTranslate,
  }),
}));

vi.mock('../../hooks/useWatchlist', () => ({
  useWatchlist: () => ({
    addWatchlistItem,
    loadWatchlistEpisodes,
    refreshWatchlist,
  }),
}));

describe('SeriesManager', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useUIStore.setState({
      currentTab: 'series',
      theme: 'dark',
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
});
