import { useState, useEffect, useRef } from 'react';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useTranslation } from '../../hooks/useTranslation';
import { useAppStore } from '../../stores/appStore';

const URL_HISTORY_KEY = 'url_history';
const MAX_HISTORY = 5;

const getUrlHistory = (): string[] => {
  try {
    const stored = localStorage.getItem(URL_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveUrlHistory = (url: string) => {
  const history = getUrlHistory().filter(u => u !== url);
  history.unshift(url);
  localStorage.setItem(URL_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
};

export const UrlInput: React.FC = () => {
  const { currentUrl, setUrl, isTranslating } = useAppStore();
  const { parseAndTranslate, loading } = useTranslation();
  const [localUrl, setLocalUrl] = useState(currentUrl);
  const [history, setHistory] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHistory(getUrlHistory());
  }, []);

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
    saveUrlHistory(localUrl);
    setHistory(getUrlHistory());
    setUrl(localUrl);
    await parseAndTranslate(localUrl);
  };

  const handleSelectHistory = (url: string) => {
    setLocalUrl(url);
    setShowDropdown(false);
  };

  return (
    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
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
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
              {history.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectHistory(url)}
                  className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 truncate transition-colors"
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
      <div className="mt-3 text-xs text-slate-500 flex gap-2">
        <span>지원 사이트:</span>
        <span className="text-slate-400">syosetu.com</span>
        <span className="text-slate-600">•</span>
        <span className="text-slate-400">syosetu.org (Hameln)</span>
        <span className="text-slate-600">•</span>
        <span className="text-slate-400">kakuyomu.jp</span>
      </div>
    </div>
  );
};
