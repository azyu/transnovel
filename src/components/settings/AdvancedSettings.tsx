import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { Button } from '../common/Button';
import { useAppStore } from '../../stores/appStore';

interface CacheStats {
  count: number;
}

export const AdvancedSettings: React.FC = () => {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const isDark = useAppStore((state) => state.theme) === 'dark';

  const loadCacheStats = async () => {
    try {
      const stats = await invoke<CacheStats>('get_cache_stats');
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
          <div className={`flex items-center justify-between p-4 rounded-lg border ${isDark ? 'bg-slate-900/50 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
            <div>
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                저장된 캐시: <span className={`font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>{cacheStats?.count ?? '-'}</span>개
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={handleClearCache}
              isLoading={isClearing}
              disabled={!cacheStats || cacheStats.count === 0}
            >
              캐시 초기화
            </Button>
          </div>
        </div>

        <div className={`border-t pt-6 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <h3 className={`text-lg font-medium mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>전체 초기화</h3>
          <p className={`text-sm mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            모든 설정, API 키, 번역 캐시를 삭제하고 앱을 초기 상태로 되돌립니다.
          </p>
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-400 font-medium">위험 구역</p>
                <p className="text-xs text-red-400/70 mt-1">이 작업은 되돌릴 수 없습니다.</p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={handleResetAll}
                isLoading={isResetting}
              >
                전체 초기화
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
