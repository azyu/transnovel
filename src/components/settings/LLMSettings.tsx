import { useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../common/Button';
import { SearchableSelect } from '../common/SearchableSelect';
import { useUIStore } from '../../stores/uiStore';
import { ProviderModal } from './llm/ProviderModal';
import { ProviderList } from './llm/ProviderList';
import type { ProviderConfig, ModelOption } from './llm/types';
import { FALLBACK_MODELS } from './llm/types';

interface GeminiModel {
  name: string;
  display_name: string;
  input_token_limit: number;
  output_token_limit: number;
}

interface AntigravityModel {
  id: string;
  name: string;
  provider: string;
}

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
}

export const LLMSettings = forwardRef((_, ref) => {
  const isDark = useUIStore((state) => state.theme) === 'dark';
  
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [useStreaming, setUseStreaming] = useState(true);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);

  const activeProvider = providers.find(p => p.id === activeProviderId);

  const handleSaveAll = useCallback(async () => {
    try {
      await Promise.all([
        invoke('set_setting', { key: 'llm_providers', value: JSON.stringify(providers) }),
        invoke('set_setting', { key: 'active_provider_id', value: activeProviderId || '' }),
        invoke('set_setting', { key: 'selected_model', value: selectedModel }),
        invoke('set_setting', { key: 'use_streaming', value: useStreaming ? 'true' : 'false' }),
      ]);
      window.dispatchEvent(new Event('settings-changed'));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }, [providers, activeProviderId, selectedModel, useStreaming]);

  useImperativeHandle(ref, () => ({
    save: handleSaveAll
  }));

  const loadSettings = useCallback(async () => {
    try {
      const settings = await invoke<{ key: string; value: string }[]>('get_settings');
      
      const providersJson = settings.find(s => s.key === 'llm_providers')?.value;
      if (providersJson) {
        try {
          setProviders(JSON.parse(providersJson));
        } catch {
          setProviders([]);
        }
      }
      
      const activeId = settings.find(s => s.key === 'active_provider_id')?.value;
      if (activeId) setActiveProviderId(activeId);
      
      const model = settings.find(s => s.key === 'selected_model')?.value;
      if (model) setSelectedModel(model);
      
      const streaming = settings.find(s => s.key === 'use_streaming')?.value;
      if (streaming) setUseStreaming(streaming === 'true');
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const fetchModels = useCallback(async (provider: ProviderConfig) => {
    setLoadingModels(true);
    try {
      let fetchedModels: ModelOption[] = [];
      
      if (provider.type === 'gemini' && provider.apiKey) {
        const result = await invoke<GeminiModel[]>('fetch_gemini_models', { apiKey: provider.apiKey });
        fetchedModels = result.map(m => ({
          id: m.name,
          name: m.display_name,
          contextLength: m.input_token_limit,
        }));
      } else if (provider.type === 'openrouter' && provider.apiKey) {
        const result = await invoke<OpenRouterModel[]>('fetch_openrouter_models', { apiKey: provider.apiKey });
        fetchedModels = result.map(m => ({
          id: m.id,
          name: m.name,
          contextLength: m.context_length,
        }));
      } else if (provider.type === 'antigravity') {
        const result = await invoke<AntigravityModel[]>('fetch_antigravity_models', { url: provider.baseUrl });
        fetchedModels = result.map(m => ({
          id: m.id,
          name: `${m.name} (${m.provider})`,
        }));
      }
      
      if (fetchedModels.length > 0) {
        setModels(fetchedModels);
      } else {
        setModels(FALLBACK_MODELS[provider.type] || []);
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
      setModels(FALLBACK_MODELS[provider.type] || []);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    if (activeProvider) {
      fetchModels(activeProvider);
    } else {
      setModels([]);
    }
  }, [activeProvider, fetchModels]);

  const handleAddProvider = () => {
    setEditingProvider(null);
    setModalOpen(true);
  };

  const handleEditProvider = (provider: ProviderConfig) => {
    setEditingProvider(provider);
    setModalOpen(true);
  };

  const handleSaveProvider = (provider: ProviderConfig) => {
    setProviders(prev => {
      const existing = prev.findIndex(p => p.id === provider.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = provider;
        return updated;
      }
      return [...prev, provider];
    });
    
    if (!activeProviderId) {
      setActiveProviderId(provider.id);
    }
  };

  const handleDeleteProvider = (id: string) => {
    if (!confirm('이 제공자를 삭제하시겠습니까?')) return;
    
    setProviders(prev => prev.filter(p => p.id !== id));
    
    if (activeProviderId === id) {
      setActiveProviderId(providers.length > 1 ? providers.find(p => p.id !== id)?.id || null : null);
      setSelectedModel('');
    }
  };

  const handleSelectProvider = (id: string) => {
    setActiveProviderId(id);
    setSelectedModel('');
  };

  const handleRefreshModels = () => {
    if (activeProvider) {
      fetchModels(activeProvider);
    }
  };

  const formatContextLength = (length?: number): string => {
    if (!length) return '';
    if (length >= 1000000) return `${(length / 1000000).toFixed(1)}M`;
    if (length >= 1000) return `${Math.round(length / 1000)}K`;
    return length.toString();
  };

  const providerOptions = providers.map(p => ({
    value: p.id,
    label: p.name,
    subLabel: p.type,
  }));

  return (
    <div className="space-y-6">
      <div className={`border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>LLM 설정</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          API 제공자를 등록하고 사용할 모델을 선택합니다.
        </p>
      </div>

      <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              제공자
            </label>
            <SearchableSelect
              options={providerOptions}
              value={activeProviderId || ''}
              onChange={handleSelectProvider}
              placeholder={providers.length === 0 ? '제공자를 추가해주세요' : '제공자 선택...'}
              disabled={providers.length === 0}
            />
          </div>
          <div className="flex-1">
            <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              모델
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <SearchableSelect
                  options={models.map(m => ({
                    value: m.id,
                    label: m.name,
                    subLabel: formatContextLength(m.contextLength),
                  }))}
                  value={selectedModel}
                  onChange={setSelectedModel}
                  loading={loadingModels}
                  placeholder={!activeProvider ? '제공자를 먼저 선택' : '모델 검색...'}
                  disabled={!activeProvider}
                />
              </div>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={handleRefreshModels} 
                isLoading={loadingModels}
                disabled={!activeProvider}
                className="shrink-0 self-start mt-0"
              >
                ↻
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>스트리밍 모드</h3>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              번역 결과를 실시간으로 표시합니다.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={useStreaming}
            onClick={() => setUseStreaming(!useStreaming)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
              useStreaming ? 'bg-blue-500' : isDark ? 'bg-slate-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                useStreaming ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      <div className={`p-6 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>등록된 제공자</h3>
          <Button size="sm" onClick={handleAddProvider}>
            + 추가
          </Button>
        </div>

        <ProviderList
          providers={providers}
          activeProviderId={activeProviderId}
          onSelect={handleSelectProvider}
          onEdit={handleEditProvider}
          onDelete={handleDeleteProvider}
        />
      </div>

      <ProviderModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveProvider}
        editingProvider={editingProvider}
      />
    </div>
  );
});

LLMSettings.displayName = 'LLMSettings';
