import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { useUIStore } from '../../stores/uiStore';
import { useApiLogStore, type ApiLogFilter } from '../../stores/apiLogStore';
import { ApiLogDetailModal } from './ApiLogDetailModal';
import { Button } from '../common/Button';
import type { ApiLogEntry, ApiLogSummary } from '../../types';

const FILTERS: { label: string; value: ApiLogFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Error', value: 'error' },
  { label: 'Success', value: 'success' },
];

export const ApiLogsSettings: React.FC = () => {
  const isDark = useUIStore((s) => s.theme) === 'dark';
  const { logs, totalCount, currentPage, pageSize, filter, isLoading, fetchLogs, setFilter, setPage, clearLogs } =
    useApiLogStore();

  const [selectedLog, setSelectedLog] = useState<ApiLogEntry | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleLogClick = async (log: ApiLogSummary) => {
    setLoadingDetail(true);
    try {
      const detail = await invoke<ApiLogEntry>('get_api_log_detail', { id: log.id });
      setSelectedLog(detail);
    } catch (error) {
      console.error('Failed to fetch log detail:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleClearLogs = async () => {
    const confirmed = await ask('모든 API 로그를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.', {
      title: 'API 로그 삭제',
      kind: 'warning',
    });
    if (!confirmed) return;

    setIsClearing(true);
    await clearLogs();
    setIsClearing(false);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'bg-green-500';
    if (status >= 400) return 'bg-red-500';
    return 'bg-yellow-500';
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'Gemini':
        return 'bg-blue-500';
      case 'OpenRouter':
        return 'bg-purple-500';
      case 'Antigravity':
        return 'bg-orange-500';
      default:
        return 'bg-slate-500';
    }
  };

  return (
    <div className="space-y-6">
      <div className={`border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>API 로그</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          번역 API 요청 기록을 확인합니다
        </p>
      </div>

      <div
        className={`p-4 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  filter === f.value
                    ? 'bg-blue-600 text-white'
                    : isDark
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <span className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              총 {totalCount.toLocaleString()}개
            </span>
            <Button variant="danger" size="sm" onClick={handleClearLogs} isLoading={isClearing} disabled={totalCount === 0}>
              로그 삭제
            </Button>
          </div>
        </div>

        <div className={`rounded-lg border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={isDark ? 'bg-slate-900/50' : 'bg-slate-50'}>
                  <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Status
                  </th>
                  <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Provider
                  </th>
                  <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Model
                  </th>
                  <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Tokens
                  </th>
                  <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Duration
                  </th>
                  <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Loading...</span>
                      </div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className={`px-3 py-8 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                    >
                      로그가 없습니다
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => handleLogClick(log)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          void handleLogClick(log);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`API 로그 상세 보기: ${log.provider} ${log.model || ''} ${log.status || 'N/A'}`}
                      className={`cursor-pointer border-t transition-colors ${
                        isDark
                          ? 'border-slate-700/50 hover:bg-slate-700/50'
                          : 'border-slate-100 hover:bg-slate-50'
                      } ${loadingDetail ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-bold text-white ${getStatusColor(log.status)}`}
                        >
                          {log.status || 'N/A'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-medium text-white ${getProviderColor(log.provider)}`}
                        >
                          {log.provider}
                        </span>
                      </td>
                      <td className={`px-3 py-2 font-mono text-xs ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        {log.model || '-'}
                      </td>
                      <td className={`px-3 py-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {log.inputTokens !== undefined && log.outputTokens !== undefined ? (
                          <span>
                            <span className="text-blue-400">I: {(log.inputTokens / 1000).toFixed(1)}k</span>
                            {' / '}
                            <span className="text-green-400">O: {(log.outputTokens / 1000).toFixed(1)}k</span>
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className={`px-3 py-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {formatDuration(log.durationMs)}
                      </td>
                      <td className={`px-3 py-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {formatTimestamp(log.timestamp)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              페이지 {currentPage} / {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className={`px-3 py-1 text-sm rounded transition-colors disabled:opacity-50 ${
                  isDark ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                이전
              </button>
              <button
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className={`px-3 py-1 text-sm rounded transition-colors disabled:opacity-50 ${
                  isDark ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                다음
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedLog && <ApiLogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  );
};
