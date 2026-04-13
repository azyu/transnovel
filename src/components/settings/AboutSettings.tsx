import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { useUIStore } from '../../stores/uiStore';
import type { LatestReleaseInfo } from '../../types';
import appIcon from '../../assets/app-icon.png';
import { Button } from '../common/Button';
import { isReleaseNewer } from '../../utils/release';

type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; release: LatestReleaseInfo }
  | { kind: 'up-to-date' }
  | { kind: 'error'; message: string };

export const AboutSettings: React.FC = () => {
  const [version, setVersion] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ kind: 'idle' });
  const theme = useUIStore((state) => state.theme);
  const isDark = theme === 'dark';

  useEffect(() => {
    getVersion().then(setVersion).catch(console.error);
  }, []);

  const handleCheckForUpdates = async () => {
    setUpdateStatus({ kind: 'checking' });

    try {
      const release = await invoke<LatestReleaseInfo>('fetch_latest_release_info');
      if (isReleaseNewer(version, release.version)) {
        setUpdateStatus({ kind: 'available', release });
        return;
      }

      setUpdateStatus({ kind: 'up-to-date' });
    } catch (error) {
      setUpdateStatus({
        kind: 'error',
        message: `업데이트 확인 실패: ${String(error)}`,
      });
    }
  };

  const handleOpenRelease = async (url: string) => {
    try {
      await invoke('open_url', { url });
    } catch (error) {
      console.error('Failed to open release page:', error);
    }
  };

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
          <div className="pt-4 space-y-3">
            <div className="flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCheckForUpdates}
                isLoading={updateStatus.kind === 'checking'}
                disabled={!version}
              >
                업데이트 확인
              </Button>
            </div>

            {updateStatus.kind === 'available' ? (
              <div className="space-y-3">
                <p className={`text-sm ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                  새 버전 {updateStatus.release.tagName}을 사용할 수 있습니다.
                </p>
                <div className="flex justify-center">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleOpenRelease(updateStatus.release.htmlUrl)}
                  >
                    릴리즈 열기
                  </Button>
                </div>
              </div>
            ) : null}

            {updateStatus.kind === 'up-to-date' ? (
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                현재 최신 버전을 사용 중입니다.
              </p>
            ) : null}

            {updateStatus.kind === 'error' ? (
              <p className={`text-sm ${isDark ? 'text-red-300' : 'text-red-600'}`}>
                {updateStatus.message}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
