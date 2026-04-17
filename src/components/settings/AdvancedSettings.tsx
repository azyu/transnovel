import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { Button } from '../common/Button';
import { messages } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';
import { useDebugStore } from '../../stores/debugStore';

interface NovelCacheStats {
  novel_id: string;
  title: string | null;
  site: string | null;
  count: number;
  total_hits: number;
}

interface CacheStatsDetailed {
  total_count: number;
  total_hits: number;
  by_novel: NovelCacheStats[];
}

const SITE_DOMAIN_LABELS: Record<string, string> = {
  syosetu: 'ncode.syosetu.com',
  nocturne: 'novel18.syosetu.com',
  hameln: 'syosetu.org',
  kakuyomu: 'kakuyomu.jp',
};

const formatNovelCacheLabel = (novel: NovelCacheStats): string => {
  const title = novel.title?.trim() || messages.settings.advanced.unknownNovelTitle;
  const domain = novel.site ? (SITE_DOMAIN_LABELS[novel.site] ?? novel.site) : messages.settings.advanced.unknownSite;
  return `${title} | ${domain} | ${novel.novel_id}`;
};

export const AdvancedSettings: React.FC = () => {
  const [cacheStats, setCacheStats] = useState<CacheStatsDetailed | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [clearingNovelId, setClearingNovelId] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const theme = useUIStore((s) => s.theme);
  const { debugMode, setDebugMode } = useDebugStore();
  const isDark = theme === 'dark';

  const loadCacheStats = async () => {
    try {
      const stats = await invoke<CacheStatsDetailed>('get_cache_stats_detailed');
      setCacheStats(stats);
    } catch (error) {
      console.error('Failed to load cache stats:', error);
    }
  };

  useEffect(() => {
    loadCacheStats();
  }, []);

  const handleClearCache = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isClearing) return;
    
    const confirmed = await ask(messages.settings.advanced.confirmClearCache, {
      title: messages.settings.advanced.confirmClearCacheTitle,
      kind: 'warning',
    });
    if (!confirmed) return;
    
    setIsClearing(true);
    try {
      const deleted = await invoke<number>('clear_cache');
      await message(messages.settings.advanced.clearCacheSuccess(deleted), {
        title: messages.settings.advanced.clearCacheSuccessTitle,
      });
      await loadCacheStats();
    } catch (error) {
      await message(messages.settings.advanced.clearCacheFailed(String(error)), {
        title: messages.settings.advanced.clearCacheFailedTitle,
        kind: 'error',
      });
    } finally {
      setIsClearing(false);
    }
  };

  const handleResetAll = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isResetting) return;
    
    const confirmed1 = await ask(messages.settings.advanced.confirmResetAll, {
      title: messages.settings.advanced.confirmResetAllTitle,
      kind: 'warning',
    });
    if (!confirmed1) return;
    
    const confirmed2 = await ask(messages.settings.advanced.confirmResetAllFinal, {
      title: messages.settings.advanced.confirmResetAllFinalTitle,
      kind: 'warning',
    });
    if (!confirmed2) return;
    
    setIsResetting(true);
    try {
      await invoke('reset_all');
      localStorage.clear();
      await message(messages.settings.advanced.resetAllSuccess, {
        title: messages.settings.advanced.resetAllSuccessTitle,
      });
      window.location.reload();
    } catch (error) {
      await message(messages.settings.advanced.resetAllFailed(String(error)), {
        title: messages.settings.advanced.resetAllFailedTitle,
        kind: 'error',
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className={`border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{messages.settings.advanced.title}</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{messages.settings.advanced.description}</p>
      </div>

      <div className={`p-6 rounded-xl border space-y-6 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div>
          <h3 className={`text-lg font-medium mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>{messages.settings.advanced.cache.title}</h3>
          <p className={`text-sm mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {messages.settings.advanced.cache.description}
          </p>
          <div className="space-y-3">
            <div className={`flex items-center justify-between p-4 rounded-lg border ${isDark ? 'bg-slate-900/50 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
              <div>
                <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {messages.settings.advanced.cache.totalCacheLabel}{' '}
                  <span className={`font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>{cacheStats?.total_count ?? '-'}</span>{messages.settings.advanced.cache.countUnit}
                  <span className={`ml-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {messages.settings.advanced.cache.totalHitsLabel}{' '}
                    <span className={`font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>{cacheStats?.total_hits ?? '-'}</span>{messages.settings.advanced.cache.hitsUnit}
                  </span>
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={handleClearCache}
                isLoading={isClearing}
                disabled={!cacheStats || cacheStats.total_count === 0}
              >
                {messages.settings.advanced.cache.clearAction}
              </Button>
            </div>

            {cacheStats && cacheStats.by_novel.length > 0 && (
              <div className={`rounded-lg border ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
                <div className={`px-4 py-2 border-b ${isDark ? 'border-slate-700/50 bg-slate-900/30' : 'border-slate-200 bg-slate-50'}`}>
                  <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{messages.settings.advanced.cache.byNovelTitle}</p>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {cacheStats.by_novel.map((novel) => (
                    <div
                      key={novel.novel_id}
                      className={`flex items-center justify-between px-4 py-2 border-b last:border-b-0 ${isDark ? 'border-slate-700/30' : 'border-slate-100'}`}
                    >
                      <div className="flex-1 min-w-0 mr-4">
                        <p
                          className={`text-sm truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}
                          title={formatNovelCacheLabel(novel)}
                        >
                          {formatNovelCacheLabel(novel)}
                        </p>
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          {messages.settings.advanced.cache.novelUsage(novel.count, novel.total_hits)}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (clearingNovelId) return;
                          setClearingNovelId(novel.novel_id);
                          try {
                            await invoke<number>('clear_cache_by_novel', { novelId: novel.novel_id });
                            await loadCacheStats();
                          } catch (error) {
                            await message(messages.settings.advanced.clearCacheFailed(String(error)), {
                              title: messages.settings.advanced.clearCacheFailedTitle,
                              kind: 'error',
                            });
                          } finally {
                            setClearingNovelId(null);
                          }
                        }}
                        isLoading={clearingNovelId === novel.novel_id}
                        disabled={clearingNovelId !== null}
                      >
                        {messages.settings.advanced.cache.deleteAction}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={`border-t pt-6 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-lg font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{messages.settings.advanced.debugMode.title}</h3>
            <button
              type="button"
              onClick={() => setDebugMode(!debugMode)}
              role="switch"
              aria-checked={debugMode}
              aria-label={messages.settings.advanced.debugMode.ariaLabel}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                debugMode 
                  ? 'bg-blue-600' 
                  : isDark ? 'bg-slate-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  debugMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {messages.settings.advanced.debugMode.description}
          </p>
        </div>

        <div className={`border-t pt-6 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <h3 className={`text-lg font-medium mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>{messages.settings.advanced.dangerZone.title}</h3>
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-400 font-medium">{messages.settings.advanced.dangerZone.resetAllTitle}</p>
                <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {messages.settings.advanced.dangerZone.resetAllDescription}
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={handleResetAll}
                isLoading={isResetting}
              >
                {messages.settings.advanced.dangerZone.resetAction}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
