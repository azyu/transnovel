import { useState, useEffect, useRef, useCallback } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useDebugStore } from '../../stores/debugStore';
import type { DebugLogEntry } from '../../stores/debugStore';

interface ExportedLog {
  timestamp: string;
  level: DebugLogEntry['type'];
  message: string;
  data?: unknown;
}

interface ExportPayload {
  exported_at: string;
  total_count: number;
  logs: ExportedLog[];
}

const LogTypeColors: Record<DebugLogEntry['type'], string> = {
  chunk: 'text-blue-400',
  complete: 'text-green-400',
  error: 'text-red-400',
  warn: 'text-yellow-400',
  info: 'text-slate-400',
};

const LogTypeBadgeColors: Record<DebugLogEntry['type'], string> = {
  chunk: 'bg-blue-500/20 text-blue-400',
  complete: 'bg-green-500/20 text-green-400',
  error: 'bg-red-500/20 text-red-400',
  warn: 'bg-yellow-500/20 text-yellow-400',
  info: 'bg-slate-500/20 text-slate-400',
};

export const DebugPanel: React.FC = () => {
  const theme = useUIStore((s) => s.theme);
  const debugMode = useDebugStore((s) => s.debugMode);
  const debugLogs = useDebugStore((s) => s.debugLogs);
  const clearDebugLogs = useDebugStore((s) => s.clearDebugLogs);
  const [isExpanded, setIsExpanded] = useState(true);
  const [filter, setFilter] = useState<DebugLogEntry['type'] | 'all'>('all');
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    if (logContainerRef.current && isExpanded) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [debugLogs, isExpanded]);

  const exportToJson = useCallback((): ExportPayload => {
    return {
      exported_at: new Date().toISOString(),
      total_count: debugLogs.length,
      logs: debugLogs.map(log => ({
        timestamp: log.timestamp.toISOString(),
        level: log.type,
        message: log.message,
        ...(log.data !== undefined && { data: log.data }),
      })),
    };
  }, [debugLogs]);

  const handleCopyJson = useCallback(async () => {
    const payload = exportToJson();
    const jsonStr = JSON.stringify(payload, null, 2);
    await navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [exportToJson]);

  if (!debugMode) return null;

  const filteredLogs = filter === 'all' 
    ? debugLogs 
    : debugLogs.filter(log => log.type === filter);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
  };

  return (
    <div className={`border-t ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
      <div 
        className={`flex items-center justify-between px-4 py-2 cursor-pointer ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <svg 
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''} ${isDark ? 'text-slate-400' : 'text-slate-500'}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            Debug Log
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>
            {debugLogs.length}
          </span>
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as DebugLogEntry['type'] | 'all')}
            className={`text-xs px-2 py-1 rounded border ${
              isDark 
                ? 'bg-slate-800 border-slate-600 text-slate-300' 
                : 'bg-white border-slate-300 text-slate-700'
            }`}
          >
            <option value="all">All</option>
            <option value="chunk">Chunk</option>
            <option value="complete">Complete</option>
            <option value="error">Error</option>
            <option value="warn">Warn</option>
            <option value="info">Info</option>
          </select>
          <button
            onClick={handleCopyJson}
            disabled={debugLogs.length === 0}
            className={`text-xs px-2 py-1 rounded disabled:opacity-50 ${
              copied
                ? 'bg-green-600 text-white'
                : isDark 
                  ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' 
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
            }`}
          >
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
          <button
            onClick={clearDebugLogs}
            className={`text-xs px-2 py-1 rounded ${
              isDark 
                ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' 
                : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
            }`}
          >
            Clear
          </button>
        </div>
      </div>
      
      {isExpanded && (
        <div 
          ref={logContainerRef}
          className={`h-48 overflow-y-auto font-mono text-xs ${isDark ? 'bg-slate-950' : 'bg-white'}`}
        >
          {filteredLogs.length === 0 ? (
            <div className={`p-4 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              No logs yet
            </div>
          ) : (
            <table className="w-full">
              <tbody>
                {filteredLogs.map((log) => (
                  <tr 
                    key={log.id} 
                    className={`border-b ${isDark ? 'border-slate-800 hover:bg-slate-900' : 'border-slate-100 hover:bg-slate-50'}`}
                  >
                    <td className={`px-2 py-1 whitespace-nowrap ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {formatTime(log.timestamp)}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${LogTypeBadgeColors[log.type]}`}>
                        {log.type}
                      </span>
                    </td>
                    <td className={`px-2 py-1 ${LogTypeColors[log.type]}`}>
                      {log.message}
                    </td>
                    {log.data !== undefined && (
                      <td className={`px-2 py-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        {String(typeof log.data === 'object' ? JSON.stringify(log.data) : log.data)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
