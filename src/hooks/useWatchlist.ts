import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSeriesStore } from '../stores/seriesStore';
import { useUIStore } from '../stores/uiStore';
import type { WatchlistEpisode, WatchlistItem } from '../types';

export const loadWatchlistOnStartupFlow = async (
  invokeFn: typeof invoke,
  actions: {
    setWatchlistItems: (items: WatchlistItem[]) => void;
    setWatchlistLoaded: (value: boolean) => void;
    setIsRefreshingWatchlist: (value: boolean) => void;
    setWatchlistError: (value: string | null) => void;
  },
) => {
  const { setWatchlistItems, setWatchlistLoaded, setIsRefreshingWatchlist, setWatchlistError } = actions;

  const items = await invokeFn<WatchlistItem[]>('list_watchlist_items');
  setWatchlistItems(items);
  setWatchlistLoaded(true);
  setWatchlistError(null);

  setIsRefreshingWatchlist(true);
  try {
    const refreshed = await invokeFn<WatchlistItem[]>('refresh_watchlist');
    setWatchlistItems(refreshed);
    setWatchlistError(null);
  } catch (error) {
    setWatchlistError(error instanceof Error ? error.message : String(error));
  } finally {
    setIsRefreshingWatchlist(false);
  }
};

export const useWatchlist = () => {
  const setWatchlistItems = useSeriesStore((s) => s.setWatchlistItems);
  const setSelectedWatchlistNovelId = useSeriesStore((s) => s.setSelectedWatchlistNovelId);
  const setWatchlistEpisodes = useSeriesStore((s) => s.setWatchlistEpisodes);
  const setIsRefreshingWatchlist = useSeriesStore((s) => s.setIsRefreshingWatchlist);
  const setWatchlistLoaded = useSeriesStore((s) => s.setWatchlistLoaded);
  const setWatchlistError = useSeriesStore((s) => s.setWatchlistError);
  const showToast = useUIStore((s) => s.showToast);
  const showError = useUIStore((s) => s.showError);

  const loadWatchlistOnStartup = useCallback(async () => {
    try {
      await loadWatchlistOnStartupFlow(invoke, {
        setWatchlistItems,
        setWatchlistLoaded,
        setIsRefreshingWatchlist,
        setWatchlistError,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWatchlistError(message);
      setWatchlistLoaded(true);
    }
  }, [setIsRefreshingWatchlist, setWatchlistError, setWatchlistItems, setWatchlistLoaded]);

  const refreshWatchlist = useCallback(async () => {
    setIsRefreshingWatchlist(true);
    try {
      const items = await invoke<WatchlistItem[]>('refresh_watchlist');
      setWatchlistItems(items);
      setWatchlistError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWatchlistError(message);
      showError('관심작품 새로고침 실패', message);
    } finally {
      setIsRefreshingWatchlist(false);
    }
  }, [setIsRefreshingWatchlist, setWatchlistError, setWatchlistItems, showError]);

  const addWatchlistItem = useCallback(async (url: string) => {
    const item = await invoke<WatchlistItem>('add_watchlist_item', { url });
    const items = await invoke<WatchlistItem[]>('list_watchlist_items');
    setWatchlistItems(items);
    setSelectedWatchlistNovelId(item.novelId);
    showToast('관심작품에 추가했습니다.');
    return item;
  }, [setSelectedWatchlistNovelId, setWatchlistItems, showToast]);

  const loadWatchlistEpisodes = useCallback(async (novelId: string) => {
    const episodes = await invoke<WatchlistEpisode[]>('get_watchlist_episodes', { novelId });
    setSelectedWatchlistNovelId(novelId);
    setWatchlistEpisodes(episodes);
    return episodes;
  }, [setSelectedWatchlistNovelId, setWatchlistEpisodes]);

  return {
    addWatchlistItem,
    loadWatchlistEpisodes,
    loadWatchlistOnStartup,
    refreshWatchlist,
  };
};
