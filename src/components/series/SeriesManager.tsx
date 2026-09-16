import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ask } from '@tauri-apps/plugin-dialog';
import { useUIStore } from '../../stores/uiStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { useTranslationStore } from '../../stores/translationStore';
import { useTranslation } from '../../hooks/useTranslation';
import { useWatchlist } from '../../hooks/useWatchlist';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import type { WatchlistEpisode, WatchlistItem } from '../../types';
import { getMessages } from '../../i18n';
import { formatWatchlistSiteLabel, getWatchlistItemKey } from '../../utils/watchlist';

const formatCheckedAt = (value: string | null, notCheckedYet: string): string => {
  if (!value) {
    return notCheckedYet;
  }

  return value.replace('T', ' ').replace('Z', '');
};

const EpisodeStatusBadge: React.FC<{
  episode: WatchlistEpisode;
  viewedLabel: string;
  newLabel: string;
}> = ({ episode, viewedLabel, newLabel }) => {
  if (episode.isNew) {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-semibold tracking-[0.08em] text-emerald-400">
        {newLabel}
      </span>
    );
  }

  if (episode.isViewed) {
    return (
      <span
        aria-label={viewedLabel}
        title={viewedLabel}
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
  const language = useUIStore((s) => s.language);
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
  const { addWatchlistItem, removeWatchlistItem, loadWatchlistEpisodes, refreshWatchlist } = useWatchlist();
  const [registerUrl, setRegisterUrl] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [removingWatchlistKey, setRemovingWatchlistKey] = useState<string | null>(null);
  const selectionRequestIdRef = useRef(0);
  const selectionTargetKeyRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  const isDark = theme === 'dark';
  const localeMessages = getMessages(language);
  const seriesMessages = localeMessages.series;
  const translationNavigationBlockedMessage = seriesMessages.translationNavigationBlocked;
  const selectedItem = useMemo(
    () =>
      watchlistItems.find((item) => getWatchlistItemKey(item) === selectedWatchlistNovelId) ??
      watchlistItems[0] ??
      null,
    [selectedWatchlistNovelId, watchlistItems],
  );

  useEffect(() => {
    if (!selectedWatchlistNovelId && watchlistItems.length > 0 && removingWatchlistKey === null) {
      const targetItem = watchlistItems[0];
      const targetKey = getWatchlistItemKey(targetItem);
      const requestId = selectionRequestIdRef.current + 1;
      selectionRequestIdRef.current = requestId;
      selectionTargetKeyRef.current = targetKey;
      void loadWatchlistEpisodes(targetItem.site, targetItem.novelId, {
        shouldApply: () =>
          isMountedRef.current &&
          requestId === selectionRequestIdRef.current &&
          useSeriesStore
            .getState()
            .watchlistItems.some((watchlistItem) => getWatchlistItemKey(watchlistItem) === targetKey),
      });
    }
  }, [loadWatchlistEpisodes, removingWatchlistKey, selectedWatchlistNovelId, watchlistItems]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      selectionRequestIdRef.current += 1;
    };
  }, []);

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!registerUrl.trim() || isRefreshingWatchlist || removingWatchlistKey !== null || registering) {
      return;
    }

    selectionRequestIdRef.current += 1;
    setRegistering(true);
    setRegisterError(null);
    try {
      const item = await addWatchlistItem(registerUrl.trim());
      if (!isMountedRef.current) {
        return;
      }
      const itemKey = getWatchlistItemKey(item);
      const requestId = selectionRequestIdRef.current + 1;
      selectionRequestIdRef.current = requestId;
      selectionTargetKeyRef.current = itemKey;
      await loadWatchlistEpisodes(item.site, item.novelId, {
        shouldApply: () =>
          isMountedRef.current &&
          requestId === selectionRequestIdRef.current &&
          useSeriesStore
            .getState()
            .watchlistItems.some((watchlistItem) => getWatchlistItemKey(watchlistItem) === itemKey),
      });
      setRegisterUrl('');
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setRegisterError(message);

      const currentState = useSeriesStore.getState();
      const recoveryItem =
        currentState.watchlistItems.find(
          (watchlistItem) =>
            getWatchlistItemKey(watchlistItem) === currentState.selectedWatchlistNovelId,
        ) ??
        currentState.watchlistItems[0] ??
        null;
      if (recoveryItem) {
        const recoveryKey = getWatchlistItemKey(recoveryItem);
        const recoveryRequestId = selectionRequestIdRef.current + 1;
        selectionRequestIdRef.current = recoveryRequestId;
        selectionTargetKeyRef.current = recoveryKey;
        try {
          await loadWatchlistEpisodes(recoveryItem.site, recoveryItem.novelId, {
            shouldApply: () =>
              isMountedRef.current &&
              recoveryRequestId === selectionRequestIdRef.current &&
              useSeriesStore
                .getState()
                .watchlistItems.some(
                  (watchlistItem) => getWatchlistItemKey(watchlistItem) === recoveryKey,
                ),
          });
        } catch {
          // Preserve the registration error when recovery loading also fails.
        }
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleRemoveItem = async (item: WatchlistItem) => {
    if (isTranslating) {
      showError(translationNavigationBlockedMessage);
      return;
    }
    if (isRefreshingWatchlist || removingWatchlistKey !== null || registering) {
      return;
    }

    const itemKey = getWatchlistItemKey(item);
    setRemovingWatchlistKey(itemKey);
    try {
      const confirmed = await ask(seriesMessages.removeConfirm(item.title), {
        title: seriesMessages.removeConfirmTitle,
        kind: 'warning',
      });
      if (!confirmed) {
        return;
      }

      if (useTranslationStore.getState().isTranslating) {
        showError(translationNavigationBlockedMessage);
        return;
      }

      const currentState = useSeriesStore.getState();
      if (currentState.isRefreshingWatchlist || currentState.watchlistItems.length === 0) {
        return;
      }

      const wasSelected = currentState.selectedWatchlistNovelId === itemKey;
      const wasImplicitlySelected =
        currentState.selectedWatchlistNovelId === null &&
        currentState.watchlistItems[0] !== undefined &&
        getWatchlistItemKey(currentState.watchlistItems[0]) === itemKey;
      const hasPendingSelection = selectionTargetKeyRef.current === itemKey;

      await removeWatchlistItem(item.site, item.novelId);
      if (wasSelected || wasImplicitlySelected || hasPendingSelection) {
        selectionRequestIdRef.current += 1;
      }
    } catch (error) {
      showError(seriesMessages.removeFailed, error instanceof Error ? error.message : String(error));
    } finally {
      setRemovingWatchlistKey(null);
    }
  };

  const handleRefresh = async () => {
    if (isTranslating) {
      showError(translationNavigationBlockedMessage);
      return;
    }
    if (removingWatchlistKey !== null || registering) {
      return;
    }

    await refreshWatchlist({
      shouldApply: () =>
        isMountedRef.current && !useTranslationStore.getState().isTranslating,
    });
    if (!isMountedRef.current || useTranslationStore.getState().isTranslating) {
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
      const targetNovelKey = getWatchlistItemKey(nextItem);
      const requestId = selectionRequestIdRef.current + 1;
      selectionRequestIdRef.current = requestId;
      selectionTargetKeyRef.current = targetNovelKey;
      await loadWatchlistEpisodes(nextItem.site, nextItem.novelId, {
        shouldApply: () =>
          !useTranslationStore.getState().isTranslating &&
          requestId === selectionRequestIdRef.current &&
          useSeriesStore
            .getState()
            .watchlistItems.some((watchlistItem) => getWatchlistItemKey(watchlistItem) === targetNovelKey),
      });
    }
  };

  const handleSelectItem = async (item: WatchlistItem) => {
    if (removingWatchlistKey !== null || registering) {
      return;
    }

    const currentNovelKey = chapter ? getWatchlistItemKey(chapter.site, chapter.novelId) : null;
    const targetNovelKey = getWatchlistItemKey(item);

    if (isTranslating && currentNovelKey && currentNovelKey !== targetNovelKey) {
      showError(translationNavigationBlockedMessage);
      return;
    }

    const requestId = selectionRequestIdRef.current + 1;
    selectionRequestIdRef.current = requestId;
    selectionTargetKeyRef.current = targetNovelKey;

    await loadWatchlistEpisodes(item.site, item.novelId, {
      shouldApply: () =>
        isMountedRef.current &&
        !useTranslationStore.getState().isTranslating &&
        requestId === selectionRequestIdRef.current &&
        useSeriesStore
          .getState()
          .watchlistItems.some((watchlistItem) => getWatchlistItemKey(watchlistItem) === targetNovelKey),
    });
  };

  const handleOpenEpisode = async (episode: WatchlistEpisode) => {
    if (isTranslating) {
      showError(translationNavigationBlockedMessage);
      return;
    }
    if (removingWatchlistKey !== null || registering) {
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
              {seriesMessages.title}
            </h2>
            <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {seriesMessages.description}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={handleRefresh}
            isLoading={isRefreshingWatchlist}
            disabled={removingWatchlistKey !== null || registering}
          >
            {localeMessages.common.actions.refresh}
          </Button>
        </div>

        <form onSubmit={handleRegister} className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-start">
          <div className="flex-1">
            <Input
              value={registerUrl}
              onChange={(event) => setRegisterUrl(event.target.value)}
              placeholder={localeMessages.common.placeholders.url}
              aria-label={seriesMessages.inputAriaLabel}
              error={registerError ?? undefined}
            />
          </div>
          <Button
            type="submit"
            isLoading={registering}
            disabled={!registerUrl.trim() || isRefreshingWatchlist || removingWatchlistKey !== null}
          >
            {seriesMessages.add}
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
            {seriesMessages.loadErrorPrefix} {watchlistError}
          </div>
        )}
      </div>

      {!watchlistLoaded ? (
        <div
          className={`rounded-2xl border p-8 text-center ${
            isDark ? 'border-slate-700 bg-slate-800 text-slate-400' : 'border-slate-200 bg-white text-slate-500'
          }`}
        >
          {seriesMessages.loading}
        </div>
      ) : watchlistItems.length === 0 ? (
        <div
          className={`rounded-2xl border p-8 text-center ${
            isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
          }`}
        >
          <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {seriesMessages.emptyTitle}
          </h3>
          <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {seriesMessages.emptyDescription}
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
                  <div
                    key={itemKey}
                    className={`flex items-stretch overflow-hidden rounded-xl border ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10'
                        : isDark
                          ? 'border-slate-700 bg-slate-900/40'
                          : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void handleSelectItem(item)}
                      disabled={removingWatchlistKey !== null || registering}
                      className={`min-w-0 flex-1 cursor-pointer p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        isSelected
                          ? 'bg-blue-500/10'
                          : isDark
                            ? 'hover:bg-slate-800/60'
                            : 'hover:bg-slate-100'
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
                            {item.author ?? seriesMessages.authorUnknown}
                          </p>
                        </div>
                        {item.lastCheckStatus === 'error' ? (
                          <span
                            aria-label={seriesMessages.status.checkFailed}
                            title={seriesMessages.status.checkFailed}
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
                        <span>{formatCheckedAt(item.lastCheckedAt, seriesMessages.notCheckedYet)}</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={seriesMessages.removeAriaLabel(item.title)}
                      title={seriesMessages.removeAriaLabel(item.title)}
                      aria-busy={removingWatchlistKey === itemKey}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleRemoveItem(item);
                      }}
                      disabled={isTranslating || isRefreshingWatchlist || registering || removingWatchlistKey !== null}
                      className={`shrink-0 border-l px-3 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50 ${
                        isDark
                          ? 'border-slate-700 text-red-300 hover:bg-red-500/10'
                          : 'border-slate-200 text-red-600 hover:bg-red-50'
                      }`}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path
                          fillRule="evenodd"
                          d="M8 2.75a1.75 1.75 0 0 0-1.75 1.75V5h-3a.75.75 0 0 0 0 1.5h.75v8.75A1.75 1.75 0 0 0 5.75 17h8.5A1.75 1.75 0 0 0 16 15.25V6.5h.75a.75.75 0 0 0 0-1.5h-3v-.5A1.75 1.75 0 0 0 12 2.75H8Zm4.25 2.25v-.5a.25.25 0 0 0-.25-.25H8a.25.25 0 0 0-.25.25V5h4.5ZM7.25 8.25a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-1.5 0v-5Zm4 0a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-1.5 0v-5Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="sr-only">{seriesMessages.remove}</span>
                    </button>
                  </div>
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
                      disabled={removingWatchlistKey !== null || registering}
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
                          {episode.title ?? seriesMessages.episodeFallbackTitle(episode.chapterNumber)}
                        </p>
                      </div>
                      <EpisodeStatusBadge
                        episode={episode}
                        viewedLabel={seriesMessages.status.viewed}
                        newLabel={seriesMessages.status.new}
                      />
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
