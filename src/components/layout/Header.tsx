import React from 'react';
import { useAppStore } from '../../stores/appStore';
import type { TabType } from '../../types';

export const Header: React.FC = () => {
  const { currentTab, setTab, theme, toggleTheme, batchProgress, isTranslating } = useAppStore();

  const tabs: { id: TabType; label: string }[] = [
    { id: 'translation', label: '번역' },
    { id: 'series', label: '시리즈' },
    { id: 'settings', label: '설정' },
  ];

  const isDark = theme === 'dark';
  const showBatchProgress = batchProgress && isTranslating && batchProgress.status === 'translating';

  return (
    <header className={`${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'} border-b h-16 flex items-center justify-between px-6 shrink-0 z-50 relative transition-colors duration-200`}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/20">
          A
        </div>
        <h1 className={`text-lg font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
          AI 소설 번역기
        </h1>
      </div>

      <nav className={`flex items-center p-1 rounded-xl ${isDark ? 'bg-slate-900/50' : 'bg-slate-100'}`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              currentTab === tab.id
                ? 'bg-blue-600 text-white shadow-md'
                : isDark 
                  ? 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            {tab.label}
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
