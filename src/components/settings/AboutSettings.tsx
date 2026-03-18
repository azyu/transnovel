import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { useUIStore } from '../../stores/uiStore';
import appIcon from '../../assets/app-icon.png';

export const AboutSettings: React.FC = () => {
  const [version, setVersion] = useState<string>('');
  const theme = useUIStore((state) => state.theme);
  const isDark = theme === 'dark';

  useEffect(() => {
    getVersion().then(setVersion).catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <div className="border-b pb-4" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
        <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>정보</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          애플리케이션 정보
        </p>
      </div>

      <div
        className="p-8 rounded-xl border flex flex-col items-center gap-6"
        style={{
          backgroundColor: isDark ? '#1e293b' : '#f8fafc',
          borderColor: isDark ? '#334155' : '#e2e8f0',
        }}
      >
        <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-lg">
          <img
            src={appIcon}
            alt="TransNovel"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="text-center space-y-2">
          <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            TransNovel
          </h3>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            버전 {version || '...'}
          </p>
        </div>
      </div>
    </div>
  );
};
