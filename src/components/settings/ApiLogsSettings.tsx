import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { useUIStore } from '../../stores/uiStore';
import { useApiLogStore, type ApiLogFilter } from '../../stores/apiLogStore';
import { ApiLogDetailModal } from './ApiLogDetailModal';
import { Button } from '../common/Button';
import type { ApiLogEntry, ApiLogSummary } from '../../types';
import { useSettingsMessages } from './useSettingsMessages';

export const ApiLogsSettings: React.FC = () => {
  const isDark = useUIStore((s) => s.theme) === 'dark';
  const settingsMessages = useSettingsMessages();
  const { logs, totalCount, currentPage, pageSize, filter, isLoading, fetchLogs, setFilter, setPage, clearLogs } =
    useApiLogStore();

  const [selectedLog, setSelectedLog] = useState<ApiLogEntry | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const filters: { label: string; value: ApiLogFilter }[] = [
    { label: settingsMessages.apiLogs.filters.all, value: 'all' },
    { label: settingsMessages.apiLogs.filters.error, value: 'error' },
    { label: settingsMessages.apiLogs.filters.success, value: 'success' },
  ];

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
    const confirmed = await ask(settingsMessages.apiLogs.confirmClear, {
      title: settingsMessages.apiLogs.confirmClearTitle,
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
      case 'OpenAI':
        return 'bg-emerald-500';
      case 'Anthropic':
        return 'bg-orange-500';
      case 'OpenAI-Compatible':
        return 'bg-cyan-500';
      default:
        return 'bg-slate-500';
    }
  };

  return (
    <div className="space-y-6">
      <div className={`border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{settingsMessages.apiLogs.title}</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          {settingsMessages.apiLogs.description}
        </p>
      </div>

      <div
        className={`p-4 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            {filters.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                aria-pressed={filter === f.value}
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
              {settingsMessages.apiLogs.totalCount(totalCount)}
            </span>
            <Button variant="danger" size="sm" onClick={handleClearLogs} isLoading={isClearing} disabled={totalCount === 0}>
              {settingsMessages.apiLogs.clearAction}
            </Button>
          </div>
        </div>

        <div className={`rounded-lg border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={isDark ? 'bg-slate-900/50' : 'bg-slate-50'}>
                  <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {settingsMessages.apiLogs.columns.status}
                  </th>
                  <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {settingsMessages.apiLogs.columns.provider}
                  </th>
                  <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {settingsMessages.apiLogs.columns.model}
                  </th>
                  <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {settingsMessages.apiLogs.columns.tokens}
                  </th>
                  <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {settingsMessages.apiLogs.columns.duration}
                  </th>
                  <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {settingsMessages.apiLogs.columns.time}
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
                        <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{settingsMessages.apiLogs.loading}</span>
                      </div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className={`px-3 py-8 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                    >
                      {settingsMessages.apiLogs.empty}
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      className={`border-t transition-colors ${
                        isDark
                          ? 'border-slate-700/50 hover:bg-slate-700/50'
                          : 'border-slate-100 hover:bg-slate-50'
                      } ${loadingDetail ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleLogClick(log)}
                          disabled={loadingDetail}
                          aria-label={settingsMessages.apiLogs.detailButtonAriaLabel(
                            log.provider,
                            log.model || '',
                            String(log.status || settingsMessages.apiLogs.notAvailable),
                          )}
                          className={`px-1.5 py-0.5 rounded text-xs font-bold text-white disabled:opacity-50 ${getStatusColor(log.status)}`}
                        >
                          {log.status || settingsMessages.apiLogs.notAvailable}
                        </button>
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
                            <span className="text-blue-400">{settingsMessages.apiLogs.tokenInputPrefix} {(log.inputTokens / 1000).toFixed(1)}k</span>
                            {' / '}
                            <span className="text-green-400">{settingsMessages.apiLogs.tokenOutputPrefix} {(log.outputTokens / 1000).toFixed(1)}k</span>
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
              {settingsMessages.apiLogs.page(currentPage, totalPages)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className={`px-3 py-1 text-sm rounded transition-colors disabled:opacity-50 ${
                  isDark ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {settingsMessages.apiLogs.prev}
              </button>
              <button
                type="button"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className={`px-3 py-1 text-sm rounded transition-colors disabled:opacity-50 ${
                  isDark ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {settingsMessages.apiLogs.next}
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedLog && <ApiLogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  );
};
