import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../../stores/uiStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { useDebugStore } from '../../stores/debugStore';
import { useTranslationStore } from '../../stores/translationStore';
import appIcon from '../../assets/app-icon.png';
import type { TabType } from '../../types';

export const Header: React.FC = () => {
  const { currentTab, setTab, theme, toggleTheme } = useUIStore(
    useShallow((s) => ({
      currentTab: s.currentTab,
      setTab: s.setTab,
      theme: s.theme,
      toggleTheme: s.toggleTheme,
    }))
  );

  const batchProgress = useSeriesStore((s) => s.batchProgress);
  const watchlistBadgeCount = useSeriesStore((s) => s.watchlistBadgeCount);
  const isTranslating = useTranslationStore((s) => s.isTranslating);
  const debugMode = useDebugStore((s) => s.debugMode);

  const allTabs: { id: TabType; label: string; devOnly?: boolean }[] = [
    { id: 'translation', label: '번역' },
    { id: 'series', label: '관심작품' },
    { id: 'settings', label: '설정' },
  ];

  const tabs = allTabs.filter(tab => !tab.devOnly || debugMode);

  const isDark = theme === 'dark';
  const showBatchProgress = batchProgress && isTranslating && batchProgress.status === 'translating';

  return (
    <header className={`${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'} border-b min-h-16 pt-[env(safe-area-inset-top)] flex items-center justify-between px-6 shrink-0 z-50 relative transition-colors duration-200`}>
      <div className="flex items-center gap-3">
        <img
          src={appIcon}
          alt="TransNovel"
          className="w-8 h-8 rounded-lg object-cover shadow-lg"
        />
        <h1 className={`text-lg font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
          TransNovel
        </h1>
      </div>

      <nav
        role="tablist"
        aria-label="메인 탭"
        className={`flex items-center p-1 rounded-xl ${isDark ? 'bg-slate-900/50' : 'bg-slate-100'}`}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={currentTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              currentTab === tab.id
                ? 'bg-blue-600 text-white shadow-md'
                : isDark 
                  ? 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <span>{tab.label}</span>
              {tab.id === 'series' && watchlistBadgeCount > 0 && (
                <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                  currentTab === tab.id
                    ? 'bg-white/20 text-white'
                    : isDark
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-blue-100 text-blue-700'
                }`}>
                  {watchlistBadgeCount}
                </span>
              )}
            </span>
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-4">
        {showBatchProgress && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="font-medium">
              {batchProgress.current_chapter}/{batchProgress.total_chapters}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={toggleTheme}
          className={`p-2 rounded-lg transition-colors ${
            isDark 
              ? 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700' 
              : 'bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200'
          }`}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
};
