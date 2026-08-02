import { useRef, useState } from 'react';
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
  const tabRefs = useRef<Partial<Record<SettingsTab, HTMLButtonElement>>>({});
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

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;

    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex].id;
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 w-full">
      <div className={`flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <nav
          role="tablist"
          aria-label={settingsMessages.tabs.ariaLabel}
          className={`flex p-1 rounded-xl ${isDark ? 'bg-slate-900/50' : 'bg-slate-200'}`}
        >
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              id={`settings-tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`settings-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              ref={(element) => {
                if (element) tabRefs.current[tab.id] = element;
                else delete tabRefs.current[tab.id];
              }}
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

      <div
        id="settings-panel-llm"
        role="tabpanel"
        aria-labelledby="settings-tab-llm"
        hidden={activeTab !== 'llm'}
        className={activeTab === 'llm' ? 'block' : 'hidden'}
      >
        <LLMSettings />
      </div>
      <div
        id="settings-panel-translation"
        role="tabpanel"
        aria-labelledby="settings-tab-translation"
        hidden={activeTab !== 'translation'}
        className={activeTab === 'translation' ? 'block' : 'hidden'}
      >
        <TranslationSettings />
      </div>
      <div
        id="settings-panel-view"
        role="tabpanel"
        aria-labelledby="settings-tab-view"
        hidden={activeTab !== 'view'}
        className={activeTab === 'view' ? 'block' : 'hidden'}
      >
        <ViewSettings />
      </div>
      <div
        id="settings-panel-advanced"
        role="tabpanel"
        aria-labelledby="settings-tab-advanced"
        hidden={activeTab !== 'advanced'}
        className={activeTab === 'advanced' ? 'block' : 'hidden'}
      >
        <AdvancedSettings />
      </div>
      <div
        id="settings-panel-api-logs"
        role="tabpanel"
        aria-labelledby="settings-tab-api-logs"
        hidden={activeTab !== 'api-logs'}
        className={activeTab === 'api-logs' ? 'block' : 'hidden'}
      >
        <ApiLogsSettings />
      </div>
      <div
        id="settings-panel-about"
        role="tabpanel"
        aria-labelledby="settings-tab-about"
        hidden={activeTab !== 'about'}
        className={activeTab === 'about' ? 'block' : 'hidden'}
      >
        <AboutSettings />
      </div>
    </div>
  );
};
