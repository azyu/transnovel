import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUIStore } from '../../stores/uiStore';

interface ProviderConfig {
  id: string;
  type: string;
  name: string;
}

interface ModelConfig {
  id: string;
  name: string;
  providerId: string;
}

export const StatusBar: React.FC = () => {
  const [providerName, setProviderName] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const isDark = useUIStore((state) => state.theme) === 'dark';

  const loadStatus = useCallback(async () => {
    try {
      const settings = await invoke<{ key: string; value: string }[]>('get_settings');

      const providersJson = settings.find(s => s.key === 'llm_providers')?.value;
      const modelsJson = settings.find(s => s.key === 'llm_models')?.value;
      const activeModelId = settings.find(s => s.key === 'active_model_id')?.value;
      
      let providers: ProviderConfig[] = [];
      let models: ModelConfig[] = [];
      
      if (providersJson) {
        try {
          providers = JSON.parse(providersJson);
        } catch {
          providers = [];
        }
      }
      
      if (modelsJson) {
        try {
          models = JSON.parse(modelsJson);
        } catch {
          models = [];
        }
      }
      
      if (activeModelId) {
        const model = models.find(m => m.id === activeModelId);
        if (model) {
          setModelName(model.name);
          const provider = providers.find(p => p.id === model.providerId);
          setProviderName(provider?.name || null);
        } else {
          setModelName(null);
          setProviderName(null);
        }
      } else {
        setModelName(null);
        setProviderName(null);
      }
      
      const streamingSetting = settings.find(s => s.key === 'use_streaming')?.value;
      setIsStreaming(streamingSetting === 'true');
    } catch (error) {
      console.error('Failed to load status:', error);
    }
  }, []);

  useEffect(() => {
    const handleSettingsChange = () => void loadStatus();
    queueMicrotask(() => void loadStatus());
    window.addEventListener('settings-changed', handleSettingsChange);
    return () => window.removeEventListener('settings-changed', handleSettingsChange);
  }, [loadStatus]);

  return (
    <div className={`min-h-6 border-t px-4 pb-[env(safe-area-inset-bottom)] flex items-center justify-end gap-4 text-xs select-none ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
      <div className="flex items-center gap-2">
        <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>제공자:</span>
        <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          {providerName || '없음'}
        </span>
      </div>
      
      <div className={isDark ? 'text-slate-600' : 'text-slate-300'}>|</div>
      
      <div className="flex items-center gap-2">
        <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>모델:</span>
        <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          {modelName || '미설정'}
        </span>
      </div>
      
      <div className={isDark ? 'text-slate-600' : 'text-slate-300'}>|</div>
      
      <div className={`font-medium ${isStreaming ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-slate-500' : 'text-slate-400')}`}>
        {isStreaming ? 'Stream' : 'Batch'}
      </div>
    </div>
  );
};
