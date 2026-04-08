import { useEffect } from 'react';
import { Header } from './components/layout/Header';
import { StatusBar } from './components/layout/StatusBar';
import { Toast } from './components/common/Toast';
import { TranslationView } from './components/translation/TranslationView';
import { SeriesManager } from './components/series/SeriesManager';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { useUIStore } from './stores/uiStore';
import { useTauriEvents } from './hooks/useTauriEvents';
import { useWatchlist } from './hooks/useWatchlist';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

function App() {
  const currentTab = useUIStore((s) => s.currentTab);
  const theme = useUIStore((s) => s.theme);
  const { loadWatchlistOnStartup } = useWatchlist();
  
  useTauriEvents();
  useKeyboardShortcuts();

  useEffect(() => {
    void loadWatchlistOnStartup();
  }, [loadWatchlistOnStartup]);

  return (
    <div className={`flex flex-col h-screen font-sans selection:bg-blue-500/30 transition-colors duration-200 ${
      theme === 'dark' ? 'bg-slate-900 text-slate-200' : 'bg-gray-50 text-gray-900'
    }`}>
      <Header />
      
      <main className="flex-1 overflow-hidden relative">
        <div
          id="panel-translation"
          role="tabpanel"
          aria-labelledby="tab-translation"
          aria-hidden={currentTab !== 'translation'}
          className={`absolute inset-0 transition-opacity duration-300 ${
            currentTab === 'translation' ? 'opacity-100 z-10 visible' : 'opacity-0 z-0 invisible pointer-events-none'
          }`}
        >
          <TranslationView />
        </div>
        <div
          id="panel-series"
          role="tabpanel"
          aria-labelledby="tab-series"
          aria-hidden={currentTab !== 'series'}
          className={`absolute inset-0 transition-opacity duration-300 ${
            currentTab === 'series' ? 'opacity-100 z-10 overflow-y-auto visible' : 'opacity-0 z-0 invisible pointer-events-none'
          }`}
        >
          {currentTab === 'series' && <SeriesManager />}
        </div>
        <div
          id="panel-settings"
          role="tabpanel"
          aria-labelledby="tab-settings"
          aria-hidden={currentTab !== 'settings'}
          className={`absolute inset-0 transition-opacity duration-300 ${
            currentTab === 'settings' ? 'opacity-100 z-10 overflow-y-auto visible' : 'opacity-0 z-0 invisible pointer-events-none'
          }`}
        >
          {currentTab === 'settings' && <SettingsPanel />}
        </div>
      </main>
      
      <StatusBar />
      <Toast />
    </div>
  );
}

export default App;
