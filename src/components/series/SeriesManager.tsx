import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { useTranslationStore } from '../../stores/translationStore';
import { useTranslation } from '../../hooks/useTranslation';
import { useWatchlist } from '../../hooks/useWatchlist';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import type { WatchlistEpisode, WatchlistItem } from '../../types';
import { messages } from '../../i18n';
import { formatWatchlistSiteLabel, getWatchlistItemKey } from '../../utils/watchlist';

const formatCheckedAt = (value: string | null): string => {
  if (!value) {
    return messages.series.notCheckedYet;
  }

  return value.replace('T', ' ').replace('Z', '');
};

const EpisodeStatusBadge: React.FC<{ episode: WatchlistEpisode }> = ({ episode }) => {
  if (episode.isNew) {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-semibold tracking-[0.08em] text-emerald-400">
        {messages.series.status.new}
      </span>
    );
  }

  if (episode.isViewed) {
    return (
      <span
        aria-label={messages.series.status.viewed}
        title={messages.series.status.viewed}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-500/10 text-slate-400"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M16.704 5.29a1 1 0 0 1 .006 1.414l-8 8.069a1 1 0 0 1-1.42.006l-4-4.035a1 1 0 1 1 1.42-1.408l3.29 3.319 7.296-7.36a1 1 0 0 1 1.408-.005Z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    );
  }

  return null;
};

export const SeriesManager: React.FC = () => {
  const theme = useUIStore((s) => s.theme);
  const showError = useUIStore((s) => s.showError);
  const setTab = useUIStore((s) => s.setTab);
  const watchlistItems = useSeriesStore((s) => s.watchlistItems);
  const selectedWatchlistNovelId = useSeriesStore((s) => s.selectedWatchlistNovelId);
  const watchlistEpisodes = useSeriesStore((s) => s.watchlistEpisodes);
  const isRefreshingWatchlist = useSeriesStore((s) => s.isRefreshingWatchlist);
  const watchlistLoaded = useSeriesStore((s) => s.watchlistLoaded);
  const watchlistError = useSeriesStore((s) => s.watchlistError);
  const chapter = useTranslationStore((s) => s.chapter);
  const isTranslating = useTranslationStore((s) => s.isTranslating);
  const setUrl = useTranslationStore((s) => s.setUrl);
  const { parseAndTranslate } = useTranslation();
  const { addWatchlistItem, loadWatchlistEpisodes, refreshWatchlist } = useWatchlist();
  const [registerUrl, setRegisterUrl] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const selectionRequestIdRef = useRef(0);

  const isDark = theme === 'dark';
  const translationNavigationBlockedMessage = messages.series.translationNavigationBlocked;
  const selectedItem = useMemo(
    () =>
      watchlistItems.find((item) => getWatchlistItemKey(item) === selectedWatchlistNovelId) ??
      watchlistItems[0] ??
      null,
    [selectedWatchlistNovelId, watchlistItems],
  );

  useEffect(() => {
    if (!selectedWatchlistNovelId && watchlistItems.length > 0) {
      void loadWatchlistEpisodes(watchlistItems[0].site, watchlistItems[0].novelId);
    }
  }, [loadWatchlistEpisodes, selectedWatchlistNovelId, watchlistItems]);

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!registerUrl.trim()) {
      return;
    }

    setRegistering(true);
    setRegisterError(null);
    try {
      const item = await addWatchlistItem(registerUrl.trim());
      await loadWatchlistEpisodes(item.site, item.novelId);
      setRegisterUrl('');
    } catch (error) {
      setRegisterError(error instanceof Error ? error.message : String(error));
    } finally {
      setRegistering(false);
    }
  };

  const handleRefresh = async () => {
    if (isTranslating) {
      showError(translationNavigationBlockedMessage);
      return;
    }

    await refreshWatchlist({
      shouldApply: () => !useTranslationStore.getState().isTranslating,
    });

    if (useTranslationStore.getState().isTranslating) {
      return;
    }

    const nextState = useSeriesStore.getState();
    const nextItem =
      nextState.watchlistItems.find(
        (item) => getWatchlistItemKey(item) === nextState.selectedWatchlistNovelId,
      ) ??
      nextState.watchlistItems[0] ??
      null;

    if (nextItem) {
      await loadWatchlistEpisodes(nextItem.site, nextItem.novelId, {
        shouldApply: () => !useTranslationStore.getState().isTranslating,
      });
    }
  };

  const handleSelectItem = async (item: WatchlistItem) => {
    const currentNovelKey = chapter ? getWatchlistItemKey(chapter.site, chapter.novelId) : null;
    const targetNovelKey = getWatchlistItemKey(item);

    if (isTranslating && currentNovelKey && currentNovelKey !== targetNovelKey) {
      showError(translationNavigationBlockedMessage);
      return;
    }

    const requestId = selectionRequestIdRef.current + 1;
    selectionRequestIdRef.current = requestId;

    await loadWatchlistEpisodes(item.site, item.novelId, {
      shouldApply: () =>
        !useTranslationStore.getState().isTranslating && requestId === selectionRequestIdRef.current,
    });
  };

  const handleOpenEpisode = async (episode: WatchlistEpisode) => {
    if (isTranslating) {
      showError(translationNavigationBlockedMessage);
      return;
    }

    setUrl(episode.chapterUrl);
    setTab('translation');
    await parseAndTranslate(episode.chapterUrl);
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 pb-20">
      <div
        className={`rounded-2xl border p-6 shadow-lg ${
          isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {messages.series.title}
            </h2>
            <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {messages.series.description}
            </p>
          </div>
          <Button variant="secondary" onClick={handleRefresh} isLoading={isRefreshingWatchlist}>
            {messages.common.actions.refresh}
          </Button>
        </div>

        <form onSubmit={handleRegister} className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-start">
          <div className="flex-1">
            <Input
              value={registerUrl}
              onChange={(event) => setRegisterUrl(event.target.value)}
              placeholder={messages.common.placeholders.url}
              aria-label={messages.series.inputAriaLabel}
              error={registerError ?? undefined}
            />
          </div>
          <Button type="submit" isLoading={registering} disabled={!registerUrl.trim()}>
            {messages.series.add}
          </Button>
        </form>

        {watchlistError && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              isDark
                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {messages.series.loadErrorPrefix} {watchlistError}
          </div>
        )}
      </div>

      {!watchlistLoaded ? (
        <div
          className={`rounded-2xl border p-8 text-center ${
            isDark ? 'border-slate-700 bg-slate-800 text-slate-400' : 'border-slate-200 bg-white text-slate-500'
          }`}
        >
          {messages.series.loading}
        </div>
      ) : watchlistItems.length === 0 ? (
        <div
          className={`rounded-2xl border p-8 text-center ${
            isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
          }`}
        >
          <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {messages.series.emptyTitle}
          </h3>
          <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {messages.series.emptyDescription}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside
            className={`rounded-2xl border p-3 ${
              isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="space-y-3">
              {watchlistItems.map((item) => {
                const itemKey = getWatchlistItemKey(item);
                const isSelected = itemKey === (selectedItem ? getWatchlistItemKey(selectedItem) : null);

                return (
                  <button
                    key={itemKey}
                    type="button"
                    onClick={() => void handleSelectItem(item)}
                    className={`w-full cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10'
                        : isDark
                          ? 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3
                          className={`truncate text-sm font-semibold ${
                            isDark ? 'text-white' : 'text-slate-900'
                          }`}
                        >
                          {item.title}
                        </h3>
                        <p
                          className={`mt-1 truncate text-xs ${
                            isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          {item.author ?? messages.series.authorUnknown}
                        </p>
                      </div>
                      {item.lastCheckStatus === 'error' ? (
                        <span
                          aria-label={messages.series.status.checkFailed}
                          title={messages.series.status.checkFailed}
                          className={`rounded-full px-2 py-1 text-xs font-bold ${
                            isDark ? 'bg-red-500/15 text-red-300' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          !
                        </span>
                      ) : item.newEpisodeCount > 0 ? (
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold ${
                            isDark
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {item.newEpisodeCount}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className={`mt-3 flex items-center justify-between text-xs ${
                        isDark ? 'text-slate-500' : 'text-slate-500'
                      }`}
                    >
                      <span>{formatWatchlistSiteLabel(item.site)}</span>
                      <span>{formatCheckedAt(item.lastCheckedAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section
            className={`rounded-2xl border ${
              isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
            }`}
          >
            {selectedItem && (
              <div className="max-h-[640px] overflow-y-auto p-3">
                <div className="space-y-2">
                  {watchlistEpisodes.map((episode) => (
                    <button
                      key={episode.chapterNumber}
                      type="button"
                      onClick={() => void handleOpenEpisode(episode)}
                      className={`flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-colors ${
                        isDark
                          ? 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                          #{episode.chapterNumber}
                        </p>
                        <p
                          className={`truncate text-sm font-medium ${
                            isDark ? 'text-slate-100' : 'text-slate-800'
                          }`}
                        >
                          {episode.title ?? messages.series.episodeFallbackTitle(episode.chapterNumber)}
                        </p>
                      </div>
                      <EpisodeStatusBadge episode={episode} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

    </div>
  );
};
