import React from 'react';
import { useAppStore } from '../../stores/appStore';
import type { TabType } from '../../types';

export const Header: React.FC = () => {
  const { currentTab, setTab } = useAppStore();

  const tabs: { id: TabType; label: string }[] = [
    { id: 'translation', label: '번역' },
    { id: 'series', label: '시리즈' },
    { id: 'settings', label: '설정' },
  ];

  return (
    <header className="bg-slate-800 border-b border-slate-700 h-16 flex items-center justify-between px-6 shrink-0 z-50 relative">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/20">
          A
        </div>
        <h1 className="text-lg font-bold text-white tracking-tight">
          AI 소설 번역기
        </h1>
      </div>

      <nav className="flex items-center bg-slate-900/50 p-1 rounded-xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              currentTab === tab.id
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="w-24">
      </div>
    </header>
  );
};
