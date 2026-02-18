import { useState, useEffect, useId } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { Modal } from '../../common/Modal';
import { useUIStore } from '../../../stores/uiStore';
import type { ProviderConfig, ProviderType } from './types';
import { PROVIDER_PRESETS } from './types';

interface ProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (provider: ProviderConfig) => void;
  editingProvider?: ProviderConfig | null;
}

export const ProviderModal: React.FC<ProviderModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingProvider,
}) => {
  const isDark = useUIStore((state) => state.theme) === 'dark';
  
  const [providerType, setProviderType] = useState<ProviderType>('gemini');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const providerTypeId = useId();
  const providerNameId = useId();
  const providerApiKeyId = useId();
  const providerBaseUrlId = useId();

  const preset = PROVIDER_PRESETS[providerType];
  const isEditing = !!editingProvider;

  useEffect(() => {
    if (editingProvider) {
      setProviderType(editingProvider.type);
      setName(editingProvider.name);
      setBaseUrl(editingProvider.baseUrl);
      setApiKey(editingProvider.apiKey);
    } else {
      setProviderType('gemini');
      setName('');
      setBaseUrl(PROVIDER_PRESETS.gemini.defaultBaseUrl);
      setApiKey('');
    }
  }, [editingProvider, isOpen]);

  useEffect(() => {
    if (!isEditing) {
      const newPreset = PROVIDER_PRESETS[providerType];
      setBaseUrl(newPreset.defaultBaseUrl);
      setName(newPreset.label);
    }
  }, [providerType, isEditing]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const provider: ProviderConfig = {
        id: editingProvider?.id || crypto.randomUUID(),
        type: providerType,
        name: name || preset.label,
        baseUrl,
        apiKey,
      };
      onSave(provider);
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
    if ((providerType === 'custom' || providerType === 'antigravity') && !baseUrl.trim()) return false;
    return true;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'AI 서비스 제공자 수정' : 'AI 서비스 제공자 추가'}
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
          <label htmlFor={providerTypeId} className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            종류
          </label>
          <select
            id={providerTypeId}
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
          <label htmlFor={providerNameId} className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            표시 이름
          </label>
          <Input
            id={providerNameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={preset.label}
          />
        </div>

        <div>
          <label htmlFor={providerApiKeyId} className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            API 키 {!preset.apiKeyRequired && <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>(선택)</span>}
          </label>
          {preset.apiKeyHelpUrl && (
            <p className={`text-xs mb-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <button
                type="button"
                onClick={() => openUrl(preset.apiKeyHelpUrl!)}
                className="text-blue-400 hover:underline"
              >
                {preset.apiKeyHelpText}
              </button>
            </p>
          )}
          <Input
            id={providerApiKeyId}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={preset.apiKeyPlaceholder || 'API 키'}
          />
        </div>

        {(providerType === 'custom' || providerType === 'antigravity') && (
          <div>
            <label htmlFor={providerBaseUrlId} className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              기본 URL
            </label>
            <Input
              id={providerBaseUrlId}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={preset.defaultBaseUrl || 'https://...'}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};
