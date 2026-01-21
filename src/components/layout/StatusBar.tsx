import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUIStore } from '../../stores/uiStore';

type ProviderType = 'gemini' | 'openrouter' | 'anthropic' | 'openai' | 'antigravity' | 'custom';

interface ModelConfig {
  id: string;
  name: string;
  providerType: ProviderType;
  modelId: string;
}

const PROVIDER_LABELS: Record<ProviderType, string> = {
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  antigravity: 'Antigravity',
  custom: 'Custom',
};

export const StatusBar: React.FC = () => {
  const [activeModel, setActiveModel] = useState<ModelConfig | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const isDark = useUIStore((state) => state.theme) === 'dark';

  const loadStatus = useCallback(async () => {
    try {
      const settings = await invoke<{ key: string; value: string }[]>('get_settings');

      const modelsJson = settings.find(s => s.key === 'llm_models')?.value;
      const activeModelId = settings.find(s => s.key === 'active_model_id')?.value;
      
      if (modelsJson && activeModelId) {
        try {
          const models: ModelConfig[] = JSON.parse(modelsJson);
          const model = models.find(m => m.id === activeModelId);
          setActiveModel(model || null);
        } catch {
          setActiveModel(null);
        }
      } else {
        setActiveModel(null);
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
    <div className={`h-6 border-t px-4 flex items-center justify-end gap-4 text-xs select-none ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
      <div className="flex items-center gap-2">
        <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>API:</span>
        <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          {activeModel ? PROVIDER_LABELS[activeModel.providerType] : '없음'}
        </span>
      </div>
      
      <div className={isDark ? 'text-slate-600' : 'text-slate-300'}>|</div>
      
      <div className="flex items-center gap-2">
        <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>모델:</span>
        <span className={`font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          {activeModel?.name || '미설정'}
        </span>
      </div>
      
      <div className={isDark ? 'text-slate-600' : 'text-slate-300'}>|</div>
      
      <div className={`font-medium ${isStreaming ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-slate-500' : 'text-slate-400')}`}>
        {isStreaming ? 'Stream' : 'Batch'}
      </div>
    </div>
  );
};
