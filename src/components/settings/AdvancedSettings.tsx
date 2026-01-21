import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { Button } from '../common/Button';
import { useUIStore } from '../../stores/uiStore';
import { useDebugStore } from '../../stores/debugStore';

interface NovelCacheStats {
  novel_id: string;
  count: number;
  total_hits: number;
}

interface CacheStatsDetailed {
  total_count: number;
  total_hits: number;
  by_novel: NovelCacheStats[];
}

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
    
    const confirmed = await ask('번역 캐시를 모두 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.', {
      title: '캐시 초기화',
      kind: 'warning',
    });
    if (!confirmed) return;
    
    setIsClearing(true);
    try {
      const deleted = await invoke<number>('clear_cache');
      await message(`${deleted}개의 캐시가 삭제되었습니다.`, { title: '완료' });
      await loadCacheStats();
    } catch (error) {
      await message(`캐시 삭제 실패: ${error}`, { title: '오류', kind: 'error' });
    } finally {
      setIsClearing(false);
    }
  };

  const handleResetAll = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isResetting) return;
    
    const confirmed1 = await ask('정말로 모든 데이터를 초기화하시겠습니까?\n\n다음 항목이 삭제됩니다:\n- 번역 캐시\n- 모든 설정\n- API 키\n\n이 작업은 되돌릴 수 없습니다.', {
      title: '전체 초기화',
      kind: 'warning',
    });
    if (!confirmed1) return;
    
    const confirmed2 = await ask('다시 한번 확인합니다. 모든 데이터가 삭제됩니다. 계속하시겠습니까?', {
      title: '최종 확인',
      kind: 'warning',
    });
    if (!confirmed2) return;
    
    setIsResetting(true);
    try {
      await invoke('reset_all');
      localStorage.clear();
      await message('초기화가 완료되었습니다. 앱을 다시 시작해주세요.', { title: '완료' });
      window.location.reload();
    } catch (error) {
      await message(`초기화 실패: ${error}`, { title: '오류', kind: 'error' });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className={`border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>고급 설정</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>캐시 및 데이터 관리</p>
      </div>

      <div className={`p-6 rounded-xl border space-y-6 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div>
          <h3 className={`text-lg font-medium mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>번역 캐시</h3>
          <p className={`text-sm mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            번역된 문단은 캐시에 저장되어 같은 내용을 다시 번역할 때 API 호출 없이 빠르게 불러옵니다.
          </p>
          <div className="space-y-3">
            <div className={`flex items-center justify-between p-4 rounded-lg border ${isDark ? 'bg-slate-900/50 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
              <div>
                <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  총 캐시: <span className={`font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>{cacheStats?.total_count ?? '-'}</span>개
                  <span className={`ml-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    사용 횟수: <span className={`font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>{cacheStats?.total_hits ?? '-'}</span>회
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
                캐시 비우기
              </Button>
            </div>

            {cacheStats && cacheStats.by_novel.length > 0 && (
              <div className={`rounded-lg border ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
                <div className={`px-4 py-2 border-b ${isDark ? 'border-slate-700/50 bg-slate-900/30' : 'border-slate-200 bg-slate-50'}`}>
                  <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>소설별 캐시</p>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {cacheStats.by_novel.map((novel) => (
                    <div
                      key={novel.novel_id}
                      className={`flex items-center justify-between px-4 py-2 border-b last:border-b-0 ${isDark ? 'border-slate-700/30' : 'border-slate-100'}`}
                    >
                      <div className="flex-1 min-w-0 mr-4">
                        <p className={`text-sm font-mono truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          {novel.novel_id}
                        </p>
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          {novel.count}개 · {novel.total_hits}회 사용
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
                            await message(`캐시 삭제 실패: ${error}`, { title: '오류', kind: 'error' });
                          } finally {
                            setClearingNovelId(null);
                          }
                        }}
                        isLoading={clearingNovelId === novel.novel_id}
                        disabled={clearingNovelId !== null}
                      >
                        삭제
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
            <h3 className={`text-lg font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>개발자 모드</h3>
            <button
              onClick={() => setDebugMode(!debugMode)}
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
            번역 과정에서 발생하는 이벤트를 실시간으로 확인할 수 있는 디버그 패널을 표시합니다.
          </p>
        </div>

        <div className={`border-t pt-6 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <h3 className={`text-lg font-medium mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>위험 구역</h3>
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-400 font-medium">전체 초기화</p>
                <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  모든 설정, API 키, 번역 캐시를 삭제하고 앱을 초기 상태로 되돌립니다. 이 작업은 되돌릴 수 없습니다.
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={handleResetAll}
                isLoading={isResetting}
              >
                초기화
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
