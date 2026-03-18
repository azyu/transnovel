import { useState, useEffect, useCallback, useId } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { Modal } from '../../common/Modal';
import { useUIStore } from '../../../stores/uiStore';
import type { ModelConfig, ProviderConfig, ModelOption } from './types';
import { PROVIDER_PRESETS, FALLBACK_MODELS } from './types';

interface GeminiModel {
  name: string;
  display_name: string;
  input_token_limit: number;
}

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
}

interface ModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (model: ModelConfig) => void;
  editingModel?: ModelConfig | null;
  providers: ProviderConfig[];
}

export const ModelModal: React.FC<ModelModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingModel,
  providers,
}) => {
  const isDark = useUIStore((state) => state.theme) === 'dark';
  
  const [providerId, setProviderId] = useState('');
  const [name, setName] = useState('');
  const [modelId, setModelId] = useState('');
  const [saving, setSaving] = useState(false);
  
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const providerIdInputId = useId();
  const modelIdInputId = useId();
  const modelNameInputId = useId();

  const selectedProvider = providers.find(p => p.id === providerId);
  const providerType = selectedProvider?.type;
  const preset = providerType ? PROVIDER_PRESETS[providerType] : null;
  const isEditing = !!editingModel;

  useEffect(() => {
    if (editingModel) {
      setProviderId(editingModel.providerId);
      setName(editingModel.name);
      setModelId(editingModel.modelId);
    } else {
      setProviderId(providers[0]?.id || '');
      setName('');
      setModelId('');
    }
  }, [editingModel, isOpen, providers]);

  useEffect(() => {
    if (!isEditing && providerId) {
      setModelId('');
    }
  }, [providerId, isEditing]);

  const fetchModels = useCallback(async () => {
    if (!selectedProvider || !providerType) {
      setModels([]);
      return;
    }

    const apiKey = selectedProvider.apiKey;

    if (!apiKey && preset?.apiKeyRequired) {
      setModels(FALLBACK_MODELS[providerType] || []);
      return;
    }
    
    setLoadingModels(true);
    try {
      let fetchedModels: ModelOption[] = [];
      
      if (providerType === 'gemini' && apiKey) {
        const result = await invoke<GeminiModel[]>('fetch_gemini_models', { apiKey });
        fetchedModels = result.map(m => ({
          id: m.name,
          name: m.display_name,
          contextLength: m.input_token_limit,
        }));
      } else if (providerType === 'openrouter' && apiKey) {
        const result = await invoke<OpenRouterModel[]>('fetch_openrouter_models', { apiKey });
        fetchedModels = result.map(m => ({
          id: m.id,
          name: m.name,
          contextLength: m.context_length,
        }));
      } else if (providerType === 'openai-oauth') {
        const result = await invoke<OpenRouterModel[]>('fetch_openai_oauth_models', {
          providerId: selectedProvider.id,
        });
        fetchedModels = result.map(m => ({
          id: m.id,
          name: m.name,
          contextLength: m.context_length,
        }));
      }
      
      if (fetchedModels.length > 0) {
        setModels(fetchedModels);
      } else {
        setModels(FALLBACK_MODELS[providerType] || []);
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
      setModels(FALLBACK_MODELS[providerType] || []);
    } finally {
      setLoadingModels(false);
    }
  }, [selectedProvider, providerType, preset?.apiKeyRequired]);

  useEffect(() => {
    if (isOpen && providerId) {
      fetchModels();
    }
  }, [isOpen, providerId, fetchModels]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const selectedModel = models.find(m => m.id === modelId);
      const model: ModelConfig = {
        id: editingModel?.id || crypto.randomUUID(),
        name: name || selectedModel?.name || modelId,
        providerId,
        modelId,
      };
      onSave(model);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const canSave = () => {
    if (!providerId) return false;
    if (!modelId.trim()) return false;
    return true;
  };

  const formatContextLength = (length?: number): string => {
    if (!length) return '';
    if (length >= 1000000) return `${(length / 1000000).toFixed(1)}M`;
    if (length >= 1000) return `${Math.round(length / 1000)}K`;
    return length.toString();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? '모델 수정' : '모델 추가'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSave} isLoading={saving} disabled={!canSave()}>
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={providerIdInputId} className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            AI 서비스 제공자
          </label>
          {providers.length === 0 ? (
            <p className={`text-sm ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
              먼저 AI 서비스 제공자를 추가해주세요.
            </p>
          ) : (
            <select
              id={providerIdInputId}
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              disabled={isEditing}
              className={`w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:border-blue-500 ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              } ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({PROVIDER_PRESETS[p.type]?.label || p.type})
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label htmlFor={modelIdInputId} className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            모델 ID
          </label>
          <div className="flex gap-2 mb-2">
            <Input
              id={modelIdInputId}
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="예: gpt-4o, claude-sonnet-4, gemini-2.5-flash"
              className="flex-1"
              disabled={!providerId}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchModels}
              isLoading={loadingModels}
              className="shrink-0"
              disabled={!providerId}
            >
              ↻
            </Button>
          </div>
          {models.length > 0 && (
            <div className={`max-h-32 overflow-y-auto rounded-lg border ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
              {models.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModelId(m.id)}
                  className={`w-full px-3 py-1.5 text-left text-sm flex justify-between items-center transition-colors ${
                    modelId === m.id
                      ? isDark ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-100 text-blue-700'
                      : isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <span className="truncate">{m.name}</span>
                  {m.contextLength && (
                    <span className={`ml-2 text-xs shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {formatContextLength(m.contextLength)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label htmlFor={modelNameInputId} className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            표시 이름 <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>(선택)</span>
          </label>
          <Input
            id={modelNameInputId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={models.find(m => m.id === modelId)?.name || '자동 설정'}
            disabled={!providerId}
          />
        </div>
      </div>
    </Modal>
  );
};
