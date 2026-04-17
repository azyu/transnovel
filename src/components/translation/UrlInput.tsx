import { useState, useEffect, useRef, useId } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useTranslation } from '../../hooks/useTranslation';
import { useUIStore } from '../../stores/uiStore';
import { useTranslationStore } from '../../stores/translationStore';
import { getMessages } from '../../i18n';
import { getUrlHistory, saveUrlHistory, type UrlHistoryItem } from '../../utils/urlHistory';
import { FOCUS_TRANSLATION_URL_INPUT_EVENT } from '../../utils/tabShortcuts';

interface UrlInputProps {
  historyKey?: string;
  parseOnly?: boolean;
}

export const UrlInput: React.FC<UrlInputProps> = ({ historyKey = 'url_history', parseOnly = false }) => {
  const theme = useUIStore((s) => s.theme);
  const language = useUIStore((s) => s.language);
  const currentUrl = useTranslationStore((s) => s.currentUrl);
  const setUrl = useTranslationStore((s) => s.setUrl);
  const isTranslating = useTranslationStore((s) => s.isTranslating);
  const chapter = useTranslationStore((s) => s.chapter);

  const { parseAndTranslate, parseChapter, loading } = useTranslation();
  const [localUrl, setLocalUrl] = useState(currentUrl);
  const [history, setHistory] = useState<UrlHistoryItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const isDark = theme === 'dark';
  const localeMessages = getMessages(language);
  const supportedSites = localeMessages.translation.urlInput.supportedSiteLinks;

  useEffect(() => {
    setHistory(getUrlHistory(historyKey));
  }, [historyKey]);

  useEffect(() => {
    setLocalUrl(currentUrl);
  }, [currentUrl]);

  useEffect(() => {
    if (chapter && currentUrl && chapter.sourceUrl === currentUrl) {
      saveUrlHistory(historyKey, currentUrl, {
        novelTitle: chapter.novelTitle ?? undefined,
        chapterNumber: chapter.chapterNumber > 0 ? chapter.chapterNumber : undefined,
        title: chapter.title,
      });
      setHistory(getUrlHistory(historyKey));
    }
  }, [chapter, currentUrl, historyKey]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleFocusShortcut = () => {
      if (loading || isTranslating) {
        return;
      }

      inputRef.current?.focus();
      inputRef.current?.select();
      if (history.length > 0) {
        setShowDropdown(true);
      }
    };

    window.addEventListener(FOCUS_TRANSLATION_URL_INPUT_EVENT, handleFocusShortcut);
    return () => window.removeEventListener(FOCUS_TRANSLATION_URL_INPUT_EVENT, handleFocusShortcut);
  }, [history.length, isTranslating, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localUrl || isTranslating) return;
    setShowDropdown(false);
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
          <div className="mb-1.5 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <label htmlFor={inputId} className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {localeMessages.translation.urlInput.label}
            </label>
            <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <span>{localeMessages.translation.urlInput.supportedSites}</span>
              {supportedSites.map((site, idx) => (
                <span key={site.name} className="flex items-center gap-2">
                  {idx > 0 && <span className={isDark ? 'text-slate-600' : 'text-slate-300'}>•</span>}
                  <button
                    type="button"
                    onClick={() => invoke('open_url', { url: site.url })}
                    className={`cursor-pointer text-left hover:underline ${isDark ? 'text-slate-400 hover:text-blue-400' : 'text-slate-500 hover:text-blue-500'}`}
                  >
                    {site.name}
                  </button>
                </span>
              ))}
            </div>
          </div>
          <Input
            ref={inputRef}
            id={inputId}
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            onFocus={() => history.length > 0 && setShowDropdown(true)}
            placeholder={localeMessages.common.placeholders.url}
            disabled={loading || isTranslating}
          />
          {showDropdown && history.length > 0 && (
            <div className={`absolute top-full left-0 right-0 mt-1 border rounded-lg shadow-xl z-50 overflow-hidden ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
              {history.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectHistory(item.url)}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`truncate flex-1 min-w-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {item.url}
                    </span>
                    {item.novelTitle && (
                      <>
                        <span className={`text-xs shrink-0 max-w-[180px] truncate text-right ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                          {item.novelTitle}
                        </span>
                        <span className={`text-xs shrink-0 w-10 text-right ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          {item.chapterNumber ? localeMessages.translation.urlInput.historyChapterLabel(item.chapterNumber) : ''}
                        </span>
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button type="submit" isLoading={loading} disabled={!localUrl || isTranslating}>
          {localeMessages.common.actions.load}
        </Button>
      </form>
    </div>
  );
};
