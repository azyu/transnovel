import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useTranslation } from '../../hooks/useTranslation';
import { useUIStore } from '../../stores/uiStore';
import { useAppStore } from '../../stores/appStore';

const SUPPORTED_SITES = [
  { name: 'syosetu.com', url: 'https://syosetu.com' },
  { name: 'novel18.syosetu.com', url: 'https://novel18.syosetu.com' },
  { name: 'syosetu.org (Hameln)', url: 'https://syosetu.org' },
  { name: 'kakuyomu.jp', url: 'https://kakuyomu.jp' },
];

const MAX_HISTORY = 5;

const getUrlHistory = (key: string): string[] => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveUrlHistory = (key: string, url: string) => {
  const history = getUrlHistory(key).filter(u => u !== url);
  history.unshift(url);
  localStorage.setItem(key, JSON.stringify(history.slice(0, MAX_HISTORY)));
};

interface UrlInputProps {
  historyKey?: string;
  parseOnly?: boolean;
}

export const UrlInput: React.FC<UrlInputProps> = ({ historyKey = 'url_history', parseOnly = false }) => {
  const theme = useUIStore((s) => s.theme);
  const currentUrl = useAppStore((s) => s.currentUrl);
  const setUrl = useAppStore((s) => s.setUrl);
  const isTranslating = useAppStore((s) => s.isTranslating);

  const { parseAndTranslate, parseChapter, loading } = useTranslation();
  const [localUrl, setLocalUrl] = useState(currentUrl);
  const [history, setHistory] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    setHistory(getUrlHistory(historyKey));
  }, [historyKey]);

  useEffect(() => {
    setLocalUrl(currentUrl);
  }, [currentUrl]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localUrl || isTranslating) return;
    setShowDropdown(false);
    saveUrlHistory(historyKey, localUrl);
    setHistory(getUrlHistory(historyKey));
    setUrl(localUrl);
    if (parseOnly) {
      await parseChapter(localUrl);
    } else {
      await parseAndTranslate(localUrl);
    }
  };

  const handleSelectHistory = (url: string) => {
    setLocalUrl(url);
    setShowDropdown(false);
  };

  return (
    <div className={`p-6 rounded-xl border shadow-lg ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <form onSubmit={handleSubmit} className="flex gap-4 items-end">
        <div className="flex-1 relative" ref={containerRef}>
          <Input
            label="소설 URL 입력"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            onFocus={() => history.length > 0 && setShowDropdown(true)}
            placeholder="https://ncode.syosetu.com/..."
            disabled={loading || isTranslating}
          />
          {showDropdown && history.length > 0 && (
            <div className={`absolute top-full left-0 right-0 mt-1 border rounded-lg shadow-xl z-50 overflow-hidden ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
              {history.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectHistory(url)}
                  className={`w-full px-3 py-2 text-left text-sm truncate transition-colors ${isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {url}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button type="submit" isLoading={loading} disabled={!localUrl || isTranslating}>
          불러오기
        </Button>
      </form>
      <div className={`mt-3 text-xs flex gap-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
        <span>지원 사이트:</span>
        {SUPPORTED_SITES.map((site, idx) => (
          <span key={site.name} className="flex items-center gap-2">
            {idx > 0 && <span className={isDark ? 'text-slate-600' : 'text-slate-300'}>•</span>}
            <button
              type="button"
              onClick={() => invoke('open_url', { url: site.url })}
              className={`hover:underline cursor-pointer ${isDark ? 'text-slate-400 hover:text-blue-400' : 'text-slate-500 hover:text-blue-500'}`}
            >
              {site.name}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
};
