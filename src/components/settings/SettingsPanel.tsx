import { useState, useRef } from 'react';
import { LLMSettings } from './LLMSettings';
import { TranslationSettings } from './TranslationSettings';
import { ViewSettings } from './ViewSettings';
import { AdvancedSettings } from './AdvancedSettings';
import { AboutSettings } from './AboutSettings';
import { Button } from '../common/Button';
import { useAppStore } from '../../stores/appStore';

type SettingsTab = 'llm' | 'translation' | 'view' | 'advanced' | 'about';

interface SettingsHandle {
  save: () => Promise<void>;
}

export const SettingsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('llm');
  const [isSaving, setIsSaving] = useState(false);
  const { theme } = useAppStore();

  const llmRef = useRef<SettingsHandle>(null);
  const translationRef = useRef<SettingsHandle>(null);
  const viewRef = useRef<SettingsHandle>(null);

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'llm', label: 'LLM' },
    { id: 'translation', label: '번역' },
    { id: 'view', label: '보기' },
    { id: 'advanced', label: '고급' },
    { id: 'about', label: '정보' },
  ];

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      await Promise.all([
        llmRef.current?.save(),
        translationRef.current?.save(),
        viewRef.current?.save()
      ]);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const isDark = theme === 'dark';

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>설정</h2>
        <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>API 키, 모델, 번역 및 보기 옵션을 관리합니다.</p>
      </div>

      <div className={`flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <nav className={`flex p-1 rounded-xl ${isDark ? 'bg-slate-900/50' : 'bg-slate-200'}`}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isDark 
                    ? 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab !== 'advanced' && activeTab !== 'about' && (
          <Button 
            onClick={handleSaveAll} 
            isLoading={isSaving}
            className="flex items-center gap-2"
          >
            {!isSaving && (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
            )}
            설정 저장
          </Button>
        )}
      </div>
      
      <div className={activeTab === 'llm' ? 'block' : 'hidden'}>
        <LLMSettings ref={llmRef} />
      </div>
      <div className={activeTab === 'translation' ? 'block' : 'hidden'}>
        <TranslationSettings ref={translationRef} />
      </div>
      <div className={activeTab === 'view' ? 'block' : 'hidden'}>
        <ViewSettings ref={viewRef} />
      </div>
      <div className={activeTab === 'advanced' ? 'block' : 'hidden'}>
        <AdvancedSettings />
      </div>
      <div className={activeTab === 'about' ? 'block' : 'hidden'}>
        <AboutSettings />
      </div>
    </div>
  );
};
