import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSeriesStore } from '../stores/seriesStore';
import { useUIStore } from '../stores/uiStore';
import type { WatchlistEpisode, WatchlistItem } from '../types';
import { messages } from '../i18n';
import { getWatchlistItemKey } from '../utils/watchlist';

type ApplyGuardOptions = {
  shouldApply?: () => boolean;
};

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

export const loadWatchlistEpisodesFlow = async (
  invokeFn: typeof invoke,
  actions: {
    setSelectedWatchlistNovelId: (value: string | null) => void;
    setWatchlistEpisodes: (episodes: WatchlistEpisode[]) => void;
  },
  site: string,
  novelId: string,
  options?: ApplyGuardOptions,
) => {
  const episodes = await invokeFn<WatchlistEpisode[]>('get_watchlist_episodes', { site, novelId });

  if (options?.shouldApply && !options.shouldApply()) {
    return episodes;
  }

  actions.setSelectedWatchlistNovelId(getWatchlistItemKey(site, novelId));
  actions.setWatchlistEpisodes(episodes);
  return episodes;
};

export const refreshWatchlistFlow = async (
  invokeFn: typeof invoke,
  actions: {
    setWatchlistItems: (items: WatchlistItem[]) => void;
    setIsRefreshingWatchlist: (value: boolean) => void;
    setWatchlistError: (value: string | null) => void;
    showError: (message: string, detail?: string) => void;
  },
  options?: ApplyGuardOptions,
) => {
  const { setWatchlistItems, setIsRefreshingWatchlist, setWatchlistError, showError } = actions;

  setIsRefreshingWatchlist(true);
  try {
    const items = await invokeFn<WatchlistItem[]>('refresh_watchlist');

    if (options?.shouldApply && !options.shouldApply()) {
      return items;
    }

    setWatchlistItems(items);
    setWatchlistError(null);
    return items;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setWatchlistError(message);
    showError(messages.series.refreshFailed, message);
    throw error;
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

  const refreshWatchlist = useCallback(async (options?: ApplyGuardOptions) => {
    try {
      return await refreshWatchlistFlow(
        invoke,
        {
          setWatchlistItems,
          setIsRefreshingWatchlist,
          setWatchlistError,
          showError,
        },
        options,
      );
    } catch {
      return null;
    }
  }, [setIsRefreshingWatchlist, setWatchlistError, setWatchlistItems, showError]);

  const addWatchlistItem = useCallback(async (url: string) => {
    const item = await invoke<WatchlistItem>('add_watchlist_item', { url });
    const items = await invoke<WatchlistItem[]>('list_watchlist_items');
    setWatchlistItems(items);
    setSelectedWatchlistNovelId(getWatchlistItemKey(item));
    showToast(messages.series.addSuccess);
    return item;
  }, [setSelectedWatchlistNovelId, setWatchlistItems, showToast]);

  const loadWatchlistEpisodes = useCallback(async (
    site: string,
    novelId: string,
    options?: ApplyGuardOptions,
  ) =>
    loadWatchlistEpisodesFlow(
      invoke,
      {
        setSelectedWatchlistNovelId,
        setWatchlistEpisodes,
      },
      site,
      novelId,
      options,
    ), [setSelectedWatchlistNovelId, setWatchlistEpisodes]);

  return {
    addWatchlistItem,
    loadWatchlistEpisodes,
    loadWatchlistOnStartup,
    refreshWatchlist,
  };
};
