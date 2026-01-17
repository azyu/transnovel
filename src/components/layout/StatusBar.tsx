import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ApiKey } from '../../types';

interface AntigravityStatus {
  running: boolean;
  authenticated: boolean;
  url: string;
}

export const StatusBar: React.FC = () => {
  const [model, setModel] = useState<string>('');
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [antigravityStatus, setAntigravityStatus] = useState<AntigravityStatus | null>(null);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const [settings, keys, agStatus] = await Promise.all([
          invoke<{ key: string; value: string }[]>('get_settings'),
          invoke<ApiKey[]>('get_api_keys'),
          invoke<AntigravityStatus>('check_antigravity_status'),
        ]);

        const modelSetting = settings.find(s => s.key === 'selected_model');
        if (modelSetting) setModel(modelSetting.value);

        setHasGeminiKey(keys.some(k => k.key_type === 'gemini'));
        setAntigravityStatus(agStatus);
      } catch (error) {
        console.error('Failed to load status:', error);
      }
    };

    loadStatus();
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatModelName = (name: string): string => {
    if (!name) return '미설정';
    return name
      .replace(/-preview.*$/, '')
      .replace(/-\d{8}$/, '')
      .replace(/-/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const antigravityConnected = antigravityStatus?.running && antigravityStatus?.authenticated;

  return (
    <div className="h-6 bg-slate-900 border-t border-slate-800 px-4 flex items-center justify-end gap-4 text-xs text-slate-400 select-none">
      <div className="flex items-center gap-2">
        <span className="text-slate-500">모델:</span>
        <span className="text-slate-300 font-medium">{formatModelName(model)}</span>
      </div>
      
      <div className="flex items-center gap-2">
        <div 
          className={`w-2 h-2 rounded-full ${hasGeminiKey ? 'bg-green-500' : 'bg-slate-600'}`}
          title={hasGeminiKey ? 'Gemini API 키 등록됨' : 'Gemini API 키 없음'} 
        />
        <div 
          className={`w-2 h-2 rounded-full ${
            antigravityConnected ? 'bg-green-500' : 
            antigravityStatus?.running ? 'bg-yellow-500' : 'bg-slate-600'
          }`}
          title={
            !antigravityStatus?.running ? 'Antigravity Proxy 미실행' :
            !antigravityStatus?.authenticated ? 'Antigravity 인증 필요' : 'Antigravity 연결됨'
          }
        />
      </div>
    </div>
  );
};
