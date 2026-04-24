import { useState, useEffect, useCallback, useId } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { Modal } from '../../common/Modal';
import { useUIStore } from '../../../stores/uiStore';
import type { ModelConfig, ProviderConfig, ModelOption } from './types';
import { PROVIDER_PRESETS, FALLBACK_MODELS } from './types';
import { useSettingsMessages } from '../useSettingsMessages';

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
  disabled?: boolean;
}

export const ModelModal: React.FC<ModelModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingModel,
  providers,
  disabled = false,
}) => {
  const isDark = useUIStore((state) => state.theme) === 'dark';
  const isLocked = disabled;
  const settingsMessages = useSettingsMessages();
  const llmMessages = settingsMessages.llm;
  const modelModalMessages = llmMessages.modelModal;
  
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
  const supportsModelDiscovery = providerType === 'gemini'
    || providerType === 'openrouter'
    || providerType === 'openai'
    || providerType === 'openai-oauth'
    || providerType === 'custom';

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
    if (isLocked) {
      setModels([]);
      setLoadingModels(false);
      return;
    }

    if (!selectedProvider || !providerType) {
      setModels([]);
      return;
    }

    if (!supportsModelDiscovery) {
      setModels(FALLBACK_MODELS[providerType] || []);
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
      } else if ((providerType === 'openai' || providerType === 'custom') && apiKey) {
        const result = await invoke<OpenRouterModel[]>('fetch_openai_compatible_models', {
          apiKey,
          baseUrl: selectedProvider.baseUrl || preset?.defaultBaseUrl || '',
        });
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
  }, [selectedProvider, providerType, preset?.apiKeyRequired, preset?.defaultBaseUrl, supportsModelDiscovery, isLocked]);

  useEffect(() => {
    if (isOpen && providerId && !isLocked) {
      fetchModels();
    }
  }, [isOpen, providerId, fetchModels, isLocked]);

  const handleSave = async () => {
    if (isLocked) return;
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
      title={isEditing ? modelModalMessages.editTitle : modelModalMessages.addTitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {modelModalMessages.cancel}
          </Button>
          <Button onClick={handleSave} isLoading={saving} disabled={isLocked || !canSave()}>
            {modelModalMessages.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={providerIdInputId} className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            {modelModalMessages.providerLabel}
          </label>
          {providers.length === 0 ? (
            <p className={`text-sm ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
              {modelModalMessages.noProviders}
            </p>
          ) : (
            <select
              id={providerIdInputId}
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              disabled={isEditing || isLocked}
              className={`w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:border-blue-500 ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              } ${(isEditing || isLocked) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({llmMessages.providerTypes[p.type].label || p.type})
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label htmlFor={modelIdInputId} className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            {modelModalMessages.modelIdLabel}
          </label>
          <div className="flex gap-2 mb-2">
              <Input
                id={modelIdInputId}
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder={modelModalMessages.modelIdPlaceholder}
                className="flex-1"
                disabled={isLocked || !providerId}
              />
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchModels}
              isLoading={loadingModels}
              className="shrink-0"
              disabled={isLocked || !providerId || !supportsModelDiscovery}
              title={modelModalMessages.refreshModels}
              aria-label={modelModalMessages.refreshModels}
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
                  disabled={isLocked}
                  className={`w-full px-3 py-1.5 text-left text-sm flex justify-between items-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
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
            {modelModalMessages.displayNameLabel}{' '}
            <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>({modelModalMessages.optional})</span>
          </label>
          <Input
            id={modelNameInputId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={models.find(m => m.id === modelId)?.name || modelModalMessages.displayNameAutoPlaceholder}
            disabled={isLocked || !providerId}
          />
        </div>
      </div>
    </Modal>
  );
};
