import React, { useState } from 'react';
import { LLMSettings } from './LLMSettings';
import { TranslationSettings } from './TranslationSettings';
import { ViewSettings } from './ViewSettings';

type SettingsTab = 'llm' | 'translation' | 'view';

export const SettingsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('llm');

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'llm', label: 'LLM' },
    { id: 'translation', label: '번역' },
    { id: 'view', label: '보기' },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">설정</h2>
        <p className="text-slate-400">API 키, 모델, 번역 및 보기 옵션을 관리합니다.</p>
      </div>

      <div className="border-b border-slate-700">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      
      {activeTab === 'llm' && <LLMSettings />}
      {activeTab === 'translation' && <TranslationSettings />}
      {activeTab === 'view' && <ViewSettings />}
    </div>
  );
};
