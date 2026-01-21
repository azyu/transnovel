import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUIStore } from '../../stores/uiStore';

type Provider = 'gemini' | 'openrouter' | 'antigravity';

const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  antigravity: 'Antigravity',
};

export const StatusBar: React.FC = () => {
  const [activeProvider, setActiveProvider] = useState<Provider | null>(null);
  const [model, setModel] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const isDark = useUIStore((state) => state.theme) === 'dark';

  const loadStatus = useCallback(async () => {
    try {
      const settings = await invoke<{ key: string; value: string }[]>('get_settings');

      const provider = settings.find(s => s.key === 'active_provider')?.value as Provider | undefined;
      setActiveProvider(provider || null);

      if (provider) {
        const modelKey = `${provider}_model`;
        const modelValue = settings.find(s => s.key === modelKey)?.value;
        setModel(modelValue || '');
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

  const formatModelName = (name: string): string => {
    if (!name) return '미설정';
    return name
      .replace(/^(anthropic|google|openai|meta-llama|deepseek)\//, '')
      .replace(/-preview.*$/, '')
      .replace(/-\d{8}$/, '')
      .replace(/-/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  return (
    <div className={`h-6 border-t px-4 flex items-center justify-end gap-4 text-xs select-none ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
      <div className="flex items-center gap-2">
        <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>API:</span>
        <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          {activeProvider ? PROVIDER_LABELS[activeProvider] : '없음'}
        </span>
      </div>
      
      <div className={isDark ? 'text-slate-600' : 'text-slate-300'}>|</div>
      
      <div className="flex items-center gap-2">
        <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>모델:</span>
        <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{formatModelName(model)}</span>
      </div>
      
      <div className={isDark ? 'text-slate-600' : 'text-slate-300'}>|</div>
      
      <div className={`font-medium ${isStreaming ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-slate-500' : 'text-slate-400')}`}>
        {isStreaming ? 'Stream' : 'Batch'}
      </div>
    </div>
  );
};
