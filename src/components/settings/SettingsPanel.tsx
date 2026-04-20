import { useState } from 'react';
import { LLMSettings } from './LLMSettings';
import { TranslationSettings } from './TranslationSettings';
import { ViewSettings } from './ViewSettings';
import { AdvancedSettings } from './AdvancedSettings';
import { ApiLogsSettings } from './ApiLogsSettings';
import { AboutSettings } from './AboutSettings';
import { useSettingsMessages } from './useSettingsMessages';
import { useUIStore } from '../../stores/uiStore';

type SettingsTab = 'llm' | 'translation' | 'view' | 'advanced' | 'api-logs' | 'about';

export const SettingsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('llm');
  const { theme } = useUIStore();
  const settingsMessages = useSettingsMessages();

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'llm', label: settingsMessages.tabs.llm },
    { id: 'translation', label: settingsMessages.tabs.translation },
    { id: 'view', label: settingsMessages.tabs.view },
    { id: 'advanced', label: settingsMessages.tabs.advanced },
    { id: 'api-logs', label: settingsMessages.tabs.apiLogs },
    { id: 'about', label: settingsMessages.tabs.about },
  ];


  const isDark = theme === 'dark';

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 w-full">
      <div className={`flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <nav className={`flex p-1 rounded-xl ${isDark ? 'bg-slate-900/50' : 'bg-slate-200'}`}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === tab.id
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


      </div>

      <div className={activeTab === 'llm' ? 'block' : 'hidden'}>
        <LLMSettings />
      </div>
      <div className={activeTab === 'translation' ? 'block' : 'hidden'}>
        <TranslationSettings />
      </div>
      <div className={activeTab === 'view' ? 'block' : 'hidden'}>
        <ViewSettings />
      </div>
      <div className={activeTab === 'advanced' ? 'block' : 'hidden'}>
        <AdvancedSettings />
      </div>
      <div className={activeTab === 'api-logs' ? 'block' : 'hidden'}>
        <ApiLogsSettings />
      </div>
      <div className={activeTab === 'about' ? 'block' : 'hidden'}>
        <AboutSettings />
      </div>
    </div>
  );
};
