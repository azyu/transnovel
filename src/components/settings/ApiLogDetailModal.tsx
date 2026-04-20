import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../../stores/uiStore';
import type { ApiLogEntry } from '../../types';
import { useSettingsMessages } from './useSettingsMessages';

interface Props {
  log: ApiLogEntry;
  onClose: () => void;
}

export const ApiLogDetailModal: React.FC<Props> = ({ log, onClose }) => {
  const isDark = useUIStore((s) => s.theme) === 'dark';
  const settingsMessages = useSettingsMessages();
  const [copiedField, setCopiedField] = useState<'request' | 'response' | 'uid' | null>(null);

  const handleCopy = async (text: string | undefined, field: 'request' | 'response' | 'uid') => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatJson = (text: string | undefined) => {
    if (!text) return '';
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={settingsMessages.apiLogs.detail.dialogLabel}
    >
      <div
        className={`relative w-full max-w-4xl max-h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col ${
          isDark ? 'bg-slate-800 ring-1 ring-white/10' : 'bg-white ring-1 ring-black/10'
        }`}
      >
        <div
          className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
            isDark ? 'border-slate-700' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`px-2 py-0.5 rounded text-xs font-bold text-white ${getStatusColor(log.status)}`}
            >
              {log.status || 'N/A'}
            </span>
            <span className={`font-mono font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {log.method}
            </span>
            <span
              className={`text-sm font-mono truncate max-w-md ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
            >
              {log.path}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={settingsMessages.apiLogs.detail.closeAriaLabel}
            className={`p-1 rounded-lg transition-colors ${
              isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className={`p-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2 mb-4">
              <p className={`text-xs uppercase font-medium shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {settingsMessages.apiLogs.detail.uidLabel}
              </p>
              <button
                type="button"
                onClick={() => handleCopy(log.id, 'uid')}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                  copiedField === 'uid'
                    ? 'bg-green-600 text-white'
                    : isDark
                      ? 'bg-slate-700 hover:bg-slate-600 text-amber-400'
                      : 'bg-slate-100 hover:bg-slate-200 text-amber-600'
                }`}
                title={settingsMessages.apiLogs.detail.uidTitle}
              >
                {copiedField === 'uid' ? settingsMessages.apiLogs.detail.copied : log.id}
                {copiedField !== 'uid' && (
                  <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className={`text-xs uppercase font-medium mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {settingsMessages.apiLogs.detail.timeLabel}
                </p>
                <p className={`text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {formatTimestamp(log.timestamp)}
                </p>
              </div>
              <div>
                <p className={`text-xs uppercase font-medium mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {settingsMessages.apiLogs.detail.durationLabel}
                </p>
                <p className={`text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {formatDuration(log.durationMs)}
                </p>
              </div>
              <div>
                <p className={`text-xs uppercase font-medium mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {settingsMessages.apiLogs.detail.tokensLabel}
                </p>
                <p className={`text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {log.inputTokens != null && log.outputTokens != null
                    ? `${log.inputTokens.toLocaleString()} / ${log.outputTokens.toLocaleString()}`
                    : '-'}
                </p>
              </div>
              <div>
                <p className={`text-xs uppercase font-medium mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {settingsMessages.apiLogs.detail.providerModelLabel}
                </p>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium text-white ${getProviderColor(log.provider)}`}>
                    {log.provider}
                  </span>
                  {log.model && (
                    <span className={`text-sm font-mono ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                      {log.model}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {log.error && (
              <div className="mt-3">
                <p className={`text-xs uppercase font-medium mb-1 text-red-500`}>{settingsMessages.apiLogs.detail.errorLabel}</p>
                <p className="text-sm text-red-400">{log.error}</p>
              </div>
            )}
          </div>

          <div className="p-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className={`text-xs uppercase font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {settingsMessages.apiLogs.detail.requestPayloadLabel}
                </p>
                <button
                  type="button"
                  onClick={() => handleCopy(log.requestBody, 'request')}
                  disabled={!log.requestBody}
                  className={`text-xs px-2 py-1 rounded transition-colors disabled:opacity-50 ${
                    copiedField === 'request'
                      ? 'bg-green-600 text-white'
                      : isDark
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                  }`}
                >
                  {copiedField === 'request' ? settingsMessages.apiLogs.detail.copied : settingsMessages.apiLogs.detail.copy}
                </button>
              </div>
              <pre
                className={`p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-64 ${
                  isDark ? 'bg-slate-900 text-slate-300' : 'bg-slate-50 text-slate-700'
                }`}
              >
                {formatJson(log.requestBody) || settingsMessages.apiLogs.detail.emptyPayload}
              </pre>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className={`text-xs uppercase font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {settingsMessages.apiLogs.detail.responsePayloadLabel}
                </p>
                <button
                  type="button"
                  onClick={() => handleCopy(log.responseBody, 'response')}
                  disabled={!log.responseBody}
                  className={`text-xs px-2 py-1 rounded transition-colors disabled:opacity-50 ${
                    copiedField === 'response'
                      ? 'bg-green-600 text-white'
                      : isDark
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                  }`}
                >
                  {copiedField === 'response' ? settingsMessages.apiLogs.detail.copied : settingsMessages.apiLogs.detail.copy}
                </button>
              </div>
              <pre
                className={`p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-64 ${
                  isDark ? 'bg-slate-900 text-slate-300' : 'bg-slate-50 text-slate-700'
                }`}
              >
                {formatJson(log.responseBody) || settingsMessages.apiLogs.detail.emptyPayload}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
