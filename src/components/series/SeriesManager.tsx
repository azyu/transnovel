import React, { useEffect, useMemo, useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { useTranslationStore } from '../../stores/translationStore';
import { useTranslation } from '../../hooks/useTranslation';
import { useWatchlist } from '../../hooks/useWatchlist';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { LegacySeriesManager } from './LegacySeriesManager';
import type { WatchlistEpisode, WatchlistItem } from '../../types';

const formatCheckedAt = (value: string | null): string => {
  if (!value) {
    return '아직 확인 전';
  }

  return value.replace('T', ' ').replace('Z', '');
};

const EpisodeStatusBadge: React.FC<{ episode: WatchlistEpisode }> = ({ episode }) => {
  if (episode.isNew) {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-400">
        새 화
      </span>
    );
  }

  if (episode.isViewed) {
    return (
      <span className="rounded-full bg-slate-500/15 px-2 py-1 text-xs font-semibold text-slate-400">
        본 화
      </span>
    );
  }

  return (
    <span className="rounded-full bg-slate-500/10 px-2 py-1 text-xs font-semibold text-slate-500">
      일반
    </span>
  );
};

export const SeriesManager: React.FC = () => {
  const theme = useUIStore((s) => s.theme);
  const setTab = useUIStore((s) => s.setTab);
  const watchlistItems = useSeriesStore((s) => s.watchlistItems);
  const selectedWatchlistNovelId = useSeriesStore((s) => s.selectedWatchlistNovelId);
  const watchlistEpisodes = useSeriesStore((s) => s.watchlistEpisodes);
  const isRefreshingWatchlist = useSeriesStore((s) => s.isRefreshingWatchlist);
  const watchlistLoaded = useSeriesStore((s) => s.watchlistLoaded);
  const watchlistError = useSeriesStore((s) => s.watchlistError);
  const setUrl = useTranslationStore((s) => s.setUrl);
  const { parseAndTranslate } = useTranslation();
  const { addWatchlistItem, loadWatchlistEpisodes, refreshWatchlist } = useWatchlist();
  const [registerUrl, setRegisterUrl] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const isDark = theme === 'dark';
  const selectedItem = useMemo(
    () =>
      watchlistItems.find((item) => item.novelId === selectedWatchlistNovelId) ??
      watchlistItems[0] ??
      null,
    [selectedWatchlistNovelId, watchlistItems],
  );

  useEffect(() => {
    if (!selectedWatchlistNovelId && watchlistItems.length > 0) {
      void loadWatchlistEpisodes(watchlistItems[0].novelId);
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
      await loadWatchlistEpisodes(item.novelId);
      setRegisterUrl('');
    } catch (error) {
      setRegisterError(error instanceof Error ? error.message : String(error));
    } finally {
      setRegistering(false);
    }
  };

  const handleRefresh = async () => {
    await refreshWatchlist();
    const nextNovelId = selectedItem?.novelId ?? watchlistItems[0]?.novelId;
    if (nextNovelId) {
      await loadWatchlistEpisodes(nextNovelId);
    }
  };

  const handleSelectItem = async (item: WatchlistItem) => {
    await loadWatchlistEpisodes(item.novelId);
  };

  const handleOpenEpisode = async (episode: WatchlistEpisode) => {
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
              관심작품
            </h2>
            <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              등록한 Syosetu 작품의 새 화를 시작 시 백그라운드로 확인하고, 수동 새로고침도 할 수 있습니다.
            </p>
          </div>
          <Button variant="secondary" onClick={handleRefresh} isLoading={isRefreshingWatchlist}>
            새로고침
          </Button>
        </div>

        <form onSubmit={handleRegister} className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-start">
          <div className="flex-1">
            <Input
              value={registerUrl}
              onChange={(event) => setRegisterUrl(event.target.value)}
              placeholder="https://ncode.syosetu.com/n3645ly/"
              aria-label="관심작품 URL 입력"
              error={registerError ?? undefined}
            />
          </div>
          <Button type="submit" isLoading={registering} disabled={!registerUrl.trim()}>
            관심작품에 추가
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
            관심작품 확인 중 오류가 있었습니다: {watchlistError}
          </div>
        )}
      </div>

      {!watchlistLoaded ? (
        <div
          className={`rounded-2xl border p-8 text-center ${
            isDark ? 'border-slate-700 bg-slate-800 text-slate-400' : 'border-slate-200 bg-white text-slate-500'
          }`}
        >
          관심작품을 불러오는 중입니다...
        </div>
      ) : watchlistItems.length === 0 ? (
        <div
          className={`rounded-2xl border p-8 text-center ${
            isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
          }`}
        >
          <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            관심작품이 없습니다
          </h3>
          <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Syosetu 작품 URL을 등록해서 새 화 추적을 시작하세요.
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
                const isSelected = item.novelId === selectedItem?.novelId;

                return (
                  <button
                    key={item.novelId}
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
                          {item.author ?? '작가 미상'}
                        </p>
                      </div>
                      {item.newEpisodeCount > 0 && (
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold ${
                            isDark
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {item.newEpisodeCount}
                        </span>
                      )}
                    </div>
                    <div
                      className={`mt-3 flex items-center justify-between text-xs ${
                        isDark ? 'text-slate-500' : 'text-slate-500'
                      }`}
                    >
                      <span>Syosetu</span>
                      <span>{formatCheckedAt(item.lastCheckedAt)}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {item.lastCheckStatus === 'error' ? (
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            isDark ? 'bg-red-500/15 text-red-300' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          확인 실패
                        </span>
                      ) : item.newEpisodeCount > 0 ? (
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            isDark
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          새 화 {item.newEpisodeCount}개
                        </span>
                      ) : (
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          새 화 없음
                        </span>
                      )}
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
              <>
                <header
                  className={`border-b px-6 py-5 ${
                    isDark ? 'border-slate-700' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3
                        className={`text-xl font-semibold ${
                          isDark ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        {selectedItem.title}
                      </h3>
                      <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {selectedItem.author ?? '작가 미상'} · 마지막 확인{' '}
                        {formatCheckedAt(selectedItem.lastCheckedAt)}
                      </p>
                    </div>
                    {selectedItem.lastCheckStatus === 'error' ? (
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          isDark ? 'bg-red-500/15 text-red-300' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        확인 실패
                      </span>
                    ) : (
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        새 화 {selectedItem.newEpisodeCount}개
                      </span>
                    )}
                  </div>
                </header>

                <div className="max-h-[640px] overflow-y-auto px-3 py-3">
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
                            {episode.title ?? `제${episode.chapterNumber}화`}
                          </p>
                        </div>
                        <EpisodeStatusBadge episode={episode} />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <section
        className={`rounded-2xl border ${
          isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
        }`}
      >
        <header className={`border-b px-6 py-5 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            기존 시리즈 도구
          </h2>
          <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            기존 챕터 목록, 일괄 번역, 내보내기 흐름은 별도 코드로 유지합니다.
          </p>
        </header>
        <div className="p-6">
          <LegacySeriesManager />
        </div>
      </section>
    </div>
  );
};
