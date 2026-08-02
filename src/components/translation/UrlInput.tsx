import { useState, useEffect, useRef, useId } from 'react';
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../common/Button';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const historyNavigationRef = useRef(false);
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
    const handleFocusShortcut = () => {
      if (loading || isTranslating) {
        return;
      }

      historyNavigationRef.current = false;
      inputRef.current?.focus();
      inputRef.current?.select();
    };

    window.addEventListener(FOCUS_TRANSLATION_URL_INPUT_EVENT, handleFocusShortcut);
    return () => window.removeEventListener(FOCUS_TRANSLATION_URL_INPUT_EVENT, handleFocusShortcut);
  }, [history.length, isTranslating, loading]);

  const submitUrl = async () => {
    if (!localUrl || isTranslating) return;
    setUrl(localUrl);
    if (parseOnly) {
      await parseChapter(localUrl);
    } else {
      await parseAndTranslate(localUrl);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitUrl();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      historyNavigationRef.current = true;
      return;
    }

    if (e.key === 'Escape') {
      historyNavigationRef.current = false;
      return;
    }

    if (e.key !== 'Enter') return;

    if (historyNavigationRef.current) {
      historyNavigationRef.current = false;
      return;
    }

    e.preventDefault();
    void submitUrl();
  };

  return (
    <div className={`p-6 rounded-xl border shadow-lg ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <form onSubmit={handleSubmit} className="flex gap-4 items-end">
        <div className="flex-1 relative">
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
          <Combobox
            value={localUrl}
            onChange={(url) => {
              historyNavigationRef.current = false;
              if (url !== null) setLocalUrl(url);
            }}
            disabled={loading || isTranslating}
            immediate
          >
            <ComboboxInput
              ref={inputRef}
              id={inputId}
              displayValue={(url: string | null) => url ?? ''}
              onChange={(e) => setLocalUrl(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={localeMessages.common.placeholders.url}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}`}
            />
            {history.length > 0 && (
              <ComboboxOptions className={`absolute top-full left-0 right-0 mt-1 border rounded-lg shadow-xl z-50 overflow-hidden focus:outline-none ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
                {history.map((item) => (
                  <ComboboxOption
                    key={item.url}
                    value={item.url}
                    className={({ focus }) => `w-full px-3 py-2 text-left text-sm transition-colors ${focus ? isDark ? 'bg-slate-700' : 'bg-slate-100' : ''}`}
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
                  </ComboboxOption>
                ))}
              </ComboboxOptions>
            )}
          </Combobox>
        </div>
        <Button type="submit" isLoading={loading} disabled={!localUrl || isTranslating}>
          {localeMessages.common.actions.load}
        </Button>
      </form>
    </div>
  );
};
