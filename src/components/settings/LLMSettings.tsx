import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { Button } from '../common/Button';
import { useUIStore } from '../../stores/uiStore';
import { ModelModal } from './llm/ModelModal';
import { ModelList } from './llm/ModelList';
import { ProviderModal } from './llm/ProviderModal';
import { ProviderList } from './llm/ProviderList';
import type { ModelConfig, ProviderConfig, ProviderType } from './llm/types';
import { PROVIDER_PRESETS } from './llm/types';

interface OldModelConfig {
  id: string;
  name: string;
  providerType: ProviderType;
  apiKey: string;
  baseUrl: string;
  modelId: string;
}

function migrateOldData(oldModels: OldModelConfig[]): { providers: ProviderConfig[]; models: ModelConfig[] } {
  const providerMap = new Map<string, ProviderConfig>();
  const newModels: ModelConfig[] = [];

  for (const oldModel of oldModels) {
    const providerKey = `${oldModel.providerType}-${oldModel.apiKey}-${oldModel.baseUrl}`;

    if (!providerMap.has(providerKey)) {
      const preset = PROVIDER_PRESETS[oldModel.providerType];
      providerMap.set(providerKey, {
        id: crypto.randomUUID(),
        type: oldModel.providerType,
        name: preset?.label || oldModel.providerType,
        apiKey: oldModel.apiKey,
        baseUrl: oldModel.baseUrl,
      });
    }

    const provider = providerMap.get(providerKey)!;
    newModels.push({
      id: oldModel.id,
      name: oldModel.name,
      providerId: provider.id,
      modelId: oldModel.modelId,
    });
  }

  return {
    providers: Array.from(providerMap.values()),
    models: newModels,
  };
}

function isOldFormat(data: unknown): data is OldModelConfig[] {
  if (!Array.isArray(data) || data.length === 0) return false;
  const first = data[0];
  return typeof first === 'object' && first !== null && 'providerType' in first && 'apiKey' in first;
}

export const LLMSettings: React.FC = () => {
  const isDark = useUIStore((state) => state.theme) === 'dark';

  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [useStreaming, setUseStreaming] = useState(true);
  const [llmConfigManaged, setLlmConfigManaged] = useState(false);
  const [llmConfigPath, setLlmConfigPath] = useState<string | null>(null);

  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);

  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const isLocked = !isLoaded || llmConfigManaged;

  const handleSaveAll = useCallback(async () => {
    try {
      await Promise.all([
        invoke('set_setting', { key: 'llm_providers', value: JSON.stringify(providers) }),
        invoke('set_setting', { key: 'llm_models', value: JSON.stringify(models) }),
        invoke('set_setting', { key: 'active_model_id', value: activeModelId || '' }),
        invoke('set_setting', { key: 'use_streaming', value: useStreaming ? 'true' : 'false' }),
      ]);
      window.dispatchEvent(new Event('settings-changed'));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }, [providers, models, activeModelId, useStreaming]);


  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await invoke<{ key: string; value: string }[]>('get_settings');
        setLoadError(null);

        const providersJson = settings.find(s => s.key === 'llm_providers')?.value;
        const modelsJson = settings.find(s => s.key === 'llm_models')?.value;
        const managed = settings.find(s => s.key === 'llm_config_managed')?.value === 'true';
        const configPath = settings.find(s => s.key === 'llm_config_path')?.value ?? null;

        setLlmConfigManaged(managed);
        setLlmConfigPath(configPath);

        if (providersJson) {
          try {
            setProviders(JSON.parse(providersJson));
          } catch {
            setProviders([]);
          }
        }

        if (modelsJson) {
          try {
            const parsedModels = JSON.parse(modelsJson);
            if (isOldFormat(parsedModels)) {
              const migrated = migrateOldData(parsedModels);
              setProviders(migrated.providers);
              setModels(migrated.models);
            } else {
              setModels(parsedModels);
            }
          } catch {
            setModels([]);
          }
        }

        const activeId = settings.find(s => s.key === 'active_model_id')?.value;
        if (activeId) setActiveModelId(activeId);

        const streaming = settings.find(s => s.key === 'use_streaming')?.value;
        if (streaming) setUseStreaming(streaming === 'true');

        setIsLoaded(true);
      } catch (error) {
        console.error('Failed to load settings:', error);
        const detail = error instanceof Error ? error.message : String(error);
        const configYamlGuidance = /config\.yaml/i.test(detail)
          ? ' config.yaml 형식을 확인하세요.'
          : '';
        setLoadError(`LLM 설정을 불러오지 못했습니다.${configYamlGuidance}${detail ? ` (${detail})` : ''}`);
      }
    };
    loadSettings();
  }, []);

  const pendingSaveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isLocked) {
      pendingSaveRef.current = null;
      return;
    }
    pendingSaveRef.current = handleSaveAll;
    const t = setTimeout(() => {
      handleSaveAll();
      pendingSaveRef.current = null;
    }, 300);
    return () => clearTimeout(t);
  }, [providers, models, activeModelId, useStreaming, isLocked, handleSaveAll]);
  useEffect(() => {
    return () => { pendingSaveRef.current?.(); };
  }, []);

  const handleAddProvider = () => {
    setEditingProvider(null);
    setProviderModalOpen(true);
  };

  const handleEditProvider = (provider: ProviderConfig) => {
    setEditingProvider(provider);
    setProviderModalOpen(true);
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
  };

  const handleDeleteProvider = async (id: string) => {
    const associatedModels = models.filter(m => m.providerId === id);
    const message = associatedModels.length > 0
      ? `이 AI 서비스 제공자를 삭제하시겠습니까?\n\n연결된 모델 ${associatedModels.length}개도 함께 삭제됩니다.`
      : '이 AI 서비스 제공자를 삭제하시겠습니까?';

    const confirmed = await ask(message, {
      title: 'AI 서비스 제공자 삭제',
      kind: 'warning',
    });
    if (!confirmed) return;

    setProviders(prev => prev.filter(p => p.id !== id));
    setModels(prev => {
      const remaining = prev.filter(m => m.providerId !== id);
      if (activeModelId && !remaining.find(m => m.id === activeModelId)) {
        setActiveModelId(remaining[0]?.id || null);
      }
      return remaining;
    });
  };

  const handleAddModel = () => {
    setEditingModel(null);
    setModelModalOpen(true);
  };

  const handleEditModel = (model: ModelConfig) => {
    setEditingModel(model);
    setModelModalOpen(true);
  };

  const handleSaveModel = (model: ModelConfig) => {
    setModels(prev => {
      const existing = prev.findIndex(m => m.id === model.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = model;
        return updated;
      }
      return [...prev, model];
    });

    if (!activeModelId) {
      setActiveModelId(model.id);
    }
  };

  const handleDeleteModel = async (id: string) => {
    const confirmed = await ask('이 모델을 삭제하시겠습니까?', {
      title: '모델 삭제',
      kind: 'warning',
    });
    if (!confirmed) return;

    setModels(prev => prev.filter(m => m.id !== id));

    if (activeModelId === id) {
      setActiveModelId(models.length > 1 ? models.find(m => m.id !== id)?.id || null : null);
    }
  };

  const handleSelectModel = (id: string) => {
    setActiveModelId(id);
  };

  return (
    <div className="space-y-6">
      <div className={`border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>LLM 설정</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          번역에 사용할 AI 서비스 제공자와 모델을 등록합니다.
        </p>
      </div>

      {llmConfigManaged && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            isDark ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          <p className="font-medium">config.yaml이 이 LLM 설정을 관리하고 있습니다.</p>
          <p className="mt-1">
            {llmConfigPath ? (
              <>
                현재 적용 중인 파일: <span className="font-mono">{llmConfigPath}</span>
              </>
            ) : (
              '이 화면에서는 제공자, 모델, 스트리밍 설정을 수정할 수 없습니다.'
            )}
          </p>
        </div>
      )}

      {loadError && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            isDark ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-rose-300 bg-rose-50 text-rose-900'
          }`}
        >
          <p className="font-medium">{loadError}</p>
          <p className="mt-1">이 문제가 해결되기 전까지 LLM 설정은 잠긴 상태로 유지됩니다.</p>
        </div>
      )}

      <div className={`p-6 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>AI 서비스 제공자</h3>
          <Button size="sm" onClick={handleAddProvider} disabled={isLocked}>
            + 추가
          </Button>
        </div>

        <ProviderList
          providers={providers}
          onEdit={handleEditProvider}
          onDelete={handleDeleteProvider}
          disabled={isLocked}
        />
      </div>

      <div className={`p-6 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>모델</h3>
          <Button size="sm" onClick={handleAddModel} disabled={providers.length === 0 || isLocked}>
            + 추가
          </Button>
        </div>

        <ModelList
          models={models}
          providers={providers}
          activeModelId={activeModelId}
          onSelect={handleSelectModel}
          onEdit={handleEditModel}
          onDelete={handleDeleteModel}
          disabled={isLocked}
        />
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
            disabled={isLocked}
            onClick={() => setUseStreaming(!useStreaming)}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
              useStreaming ? 'bg-blue-500' : isDark ? 'bg-slate-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${useStreaming ? 'translate-x-5' : 'translate-x-0'
                }`}
            />
          </button>
        </div>
      </div>

      <ProviderModal
        isOpen={providerModalOpen}
        onClose={() => setProviderModalOpen(false)}
        onSave={handleSaveProvider}
        editingProvider={editingProvider}
        disabled={isLocked}
      />

      <ModelModal
        isOpen={modelModalOpen}
        onClose={() => setModelModalOpen(false)}
        onSave={handleSaveModel}
        editingModel={editingModel}
        providers={providers}
        disabled={isLocked}
      />
    </div>
  );
};
