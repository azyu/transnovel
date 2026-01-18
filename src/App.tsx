import { Header } from './components/layout/Header';
import { StatusBar } from './components/layout/StatusBar';
import { Toast } from './components/common/Toast';
import { TranslationView } from './components/translation/TranslationView';
import { SeriesManager } from './components/series/SeriesManager';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { useUIStore } from './stores/uiStore';
import { useTauriEvents } from './hooks/useTauriEvents';

function App() {
  const currentTab = useUIStore((s) => s.currentTab);
  const theme = useUIStore((s) => s.theme);
  
  useTauriEvents();

  return (
    <div className={`flex flex-col h-screen font-sans selection:bg-blue-500/30 transition-colors duration-200 ${
      theme === 'dark' ? 'bg-slate-900 text-slate-200' : 'bg-gray-50 text-gray-900'
    }`}>
      <Header />
      
      <main className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 transition-opacity duration-300 ${currentTab === 'translation' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
          <TranslationView />
        </div>
        <div className={`absolute inset-0 transition-opacity duration-300 ${currentTab === 'series' ? 'opacity-100 z-10 overflow-y-auto' : 'opacity-0 z-0 pointer-events-none'}`}>
           {currentTab === 'series' && <SeriesManager />}
        </div>
        <div className={`absolute inset-0 transition-opacity duration-300 ${currentTab === 'settings' ? 'opacity-100 z-10 overflow-y-auto' : 'opacity-0 z-0 pointer-events-none'}`}>
           {currentTab === 'settings' && <SettingsPanel />}
        </div>
      </main>
      
      <StatusBar />
      <Toast />
    </div>
  );
}

export default App;
