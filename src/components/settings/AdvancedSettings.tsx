import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../common/Button';

interface CacheStats {
  count: number;
}

export const AdvancedSettings: React.FC = () => {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

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
    
    if (isClearing) return; // Prevent double-click
    if (!confirm('번역 캐시를 모두 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.')) return;
    
    setIsClearing(true);
    try {
      const deleted = await invoke<number>('clear_cache');
      alert(`${deleted}개의 캐시가 삭제되었습니다.`);
      await loadCacheStats();
    } catch (error) {
      alert(`캐시 삭제 실패: ${error}`);
    } finally {
      setIsClearing(false);
    }
  };

  const handleResetAll = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isResetting) return;
    if (!confirm('정말로 모든 데이터를 초기화하시겠습니까?\n\n다음 항목이 삭제됩니다:\n- 번역 캐시\n- 모든 설정\n- API 키\n\n이 작업은 되돌릴 수 없습니다.')) return;
    if (!confirm('다시 한번 확인합니다. 모든 데이터가 삭제됩니다. 계속하시겠습니까?')) return;
    
    setIsResetting(true);
    try {
      await invoke('reset_all');
      localStorage.clear();
      alert('초기화가 완료되었습니다. 앱을 다시 시작해주세요.');
      window.location.reload();
    } catch (error) {
      alert(`초기화 실패: ${error}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-700 pb-4">
        <h2 className="text-xl font-semibold text-white">고급 설정</h2>
        <p className="text-sm text-slate-400 mt-1">캐시 및 데이터 관리</p>
      </div>

      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-6">
        <div>
          <h3 className="text-lg font-medium text-white mb-2">번역 캐시</h3>
          <p className="text-sm text-slate-400 mb-4">
            번역된 문단은 캐시에 저장되어 같은 내용을 다시 번역할 때 API 호출 없이 빠르게 불러옵니다.
          </p>
          <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
            <div>
              <p className="text-sm text-slate-300">
                저장된 캐시: <span className="font-mono text-white">{cacheStats?.count ?? '-'}</span>개
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

        <div className="border-t border-slate-700 pt-6">
          <h3 className="text-lg font-medium text-white mb-2">전체 초기화</h3>
          <p className="text-sm text-slate-400 mb-4">
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
