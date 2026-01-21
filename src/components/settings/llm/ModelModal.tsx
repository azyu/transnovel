import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { SearchableSelect } from '../../common/SearchableSelect';
import { useUIStore } from '../../../stores/uiStore';
import type { ModelConfig, ProviderType, ModelOption } from './types';
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

interface AntigravityModel {
  id: string;
  name: string;
  provider: string;
}

interface ModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (model: ModelConfig) => void;
  editingModel?: ModelConfig | null;
}

export const ModelModal: React.FC<ModelModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingModel,
}) => {
  const isDark = useUIStore((state) => state.theme) === 'dark';
  
  const [providerType, setProviderType] = useState<ProviderType>('gemini');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState('');
  const [saving, setSaving] = useState(false);
  
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const preset = PROVIDER_PRESETS[providerType];
  const isEditing = !!editingModel;

  useEffect(() => {
    if (editingModel) {
      setProviderType(editingModel.providerType);
      setName(editingModel.name);
      setBaseUrl(editingModel.baseUrl);
      setApiKey(editingModel.apiKey);
      setModelId(editingModel.modelId);
    } else {
      setProviderType('gemini');
      setName('');
      setBaseUrl(PROVIDER_PRESETS.gemini.defaultBaseUrl);
      setApiKey('');
      setModelId('');
    }
  }, [editingModel, isOpen]);

  useEffect(() => {
    if (!isEditing) {
      setBaseUrl(PROVIDER_PRESETS[providerType].defaultBaseUrl);
      setModelId('');
    }
  }, [providerType, isEditing]);

  const fetchModels = useCallback(async () => {
    if (!apiKey && preset.apiKeyRequired) {
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
      } else if (providerType === 'antigravity') {
        const result = await invoke<AntigravityModel[]>('fetch_antigravity_models', { url: baseUrl });
        fetchedModels = result.map(m => ({
          id: m.id,
          name: `${m.name} (${m.provider})`,
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
  }, [providerType, apiKey, baseUrl, preset.apiKeyRequired]);

  useEffect(() => {
    if (isOpen) {
      fetchModels();
    }
  }, [isOpen, providerType, apiKey, fetchModels]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const selectedModel = models.find(m => m.id === modelId);
      const model: ModelConfig = {
        id: editingModel?.id || crypto.randomUUID(),
        name: name || selectedModel?.name || modelId,
        providerType,
        baseUrl,
        apiKey,
        modelId,
      };
      onSave(model);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const openUrl = (url: string) => {
    invoke('open_url', { url }).catch(console.error);
  };

  const canSave = () => {
    if (preset.apiKeyRequired && !apiKey.trim()) return false;
    if (providerType === 'custom' && !baseUrl.trim()) return false;
    if (!modelId.trim()) return false;
    return true;
  };

  const formatContextLength = (length?: number): string => {
    if (!length) return '';
    if (length >= 1000000) return `${(length / 1000000).toFixed(1)}M`;
    if (length >= 1000) return `${Math.round(length / 1000)}K`;
    return length.toString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={onClose}
      />
      <div className={`relative w-full max-w-md mx-4 rounded-xl shadow-xl ${
        isDark ? 'bg-slate-800' : 'bg-white'
      }`}>
        <div className={`px-6 py-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {isEditing ? '모델 수정' : '모델 추가'}
          </h3>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              AI 서비스 공급자
            </label>
            <select
              value={providerType}
              onChange={(e) => setProviderType(e.target.value as ProviderType)}
              disabled={isEditing}
              className={`w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:border-blue-500 ${
                isDark 
                  ? 'bg-slate-900 border-slate-700 text-white' 
                  : 'bg-white border-slate-300 text-slate-900'
              } ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {Object.values(PROVIDER_PRESETS).map((p) => (
                <option key={p.type} value={p.type}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              API 키 {!preset.apiKeyRequired && <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>(선택)</span>}
            </label>
            {preset.apiKeyHelpUrl && (
              <p className={`text-xs mb-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <button 
                  onClick={() => openUrl(preset.apiKeyHelpUrl!)}
                  className="text-blue-400 hover:underline"
                >
                  {preset.apiKeyHelpText}
                </button>
              </p>
            )}
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={preset.apiKeyPlaceholder || 'API 키'}
            />
          </div>

          {(providerType === 'custom' || providerType === 'antigravity') && (
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                기본 URL
              </label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={preset.defaultBaseUrl || 'https://...'}
              />
            </div>
          )}

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
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
                  value={modelId}
                  onChange={setModelId}
                  loading={loadingModels}
                  placeholder="모델 선택..."
                />
              </div>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={fetchModels} 
                isLoading={loadingModels}
                className="shrink-0"
              >
                ↻
              </Button>
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              표시 이름 <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>(선택)</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={models.find(m => m.id === modelId)?.name || '자동 설정'}
            />
          </div>
        </div>

        <div className={`px-6 py-4 border-t flex justify-end gap-3 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSave} isLoading={saving} disabled={!canSave()}>
            저장
          </Button>
        </div>
      </div>
    </div>
  );
};
