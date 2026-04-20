import { useState, useEffect, useId, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { Modal } from '../../common/Modal';
import { useUIStore } from '../../../stores/uiStore';
import type { ProviderConfig, ProviderType } from './types';
import { PROVIDER_PRESETS } from './types';
import { useSettingsMessages } from '../useSettingsMessages';

interface ProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (provider: ProviderConfig) => void;
  editingProvider?: ProviderConfig | null;
  disabled?: boolean;
}

export const ProviderModal: React.FC<ProviderModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingProvider,
  disabled = false,
}) => {
  const isDark = useUIStore((state) => state.theme) === 'dark';
  const isLocked = disabled;
  const settingsMessages = useSettingsMessages();
  const llmMessages = settingsMessages.llm;
  const providerModalMessages = llmMessages.providerModal;
  
  const [providerType, setProviderType] = useState<ProviderType>('gemini');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthDone, setOauthDone] = useState(false);
  const [oauthEmail, setOauthEmail] = useState<string | null>(null);
  const [oauthStatusError, setOauthStatusError] = useState<string | null>(null);
  const providerIdRef = useRef<string>(crypto.randomUUID());
  const providerTypeId = useId();
  const providerNameId = useId();
  const providerApiKeyId = useId();
  const providerBaseUrlId = useId();

  const preset = PROVIDER_PRESETS[providerType];
  const providerTypeMessages = llmMessages.providerTypes[providerType];
  const isEditing = !!editingProvider;
  const isOAuth = providerType === 'openai-oauth';

  useEffect(() => {
    if (!isOpen) return;

    if (editingProvider) {
      providerIdRef.current = editingProvider.id;
      setProviderType(editingProvider.type);
      setName(editingProvider.name);
      setBaseUrl(editingProvider.baseUrl);
      setApiKey(editingProvider.apiKey);
      setOauthDone(editingProvider.type === 'openai-oauth' && !!editingProvider.apiKey);
      if (editingProvider.type === 'openai-oauth' && editingProvider.apiKey) {
        invoke<{ authenticated: boolean; email: string | null }>('check_openai_oauth_status', { providerId: editingProvider.id })
          .then((r) => {
            setOauthEmail(r.email ?? null);
            setOauthStatusError(null);
          })
          .catch((error) => {
            setOauthEmail(null);
            setOauthStatusError(error instanceof Error ? error.message : String(error));
          });
      } else {
        setOauthEmail(null);
        setOauthStatusError(null);
      }
    } else {
      providerIdRef.current = crypto.randomUUID();
      setProviderType('gemini');
      setName('');
      setBaseUrl(PROVIDER_PRESETS.gemini.defaultBaseUrl);
      setApiKey('');
      setOauthDone(false);
      setOauthEmail(null);
      setOauthStatusError(null);
    }
  }, [editingProvider, isOpen]);

  useEffect(() => {
    if (!isEditing) {
      const newPreset = PROVIDER_PRESETS[providerType];
      setBaseUrl(newPreset.defaultBaseUrl);
      setName(llmMessages.providerTypes[providerType].label);
      setOauthDone(false);
      setOauthEmail(null);
      setOauthStatusError(null);
    }
  }, [providerType, isEditing, llmMessages.providerTypes]);

  const handleSave = async () => {
    if (isLocked) return;
    setSaving(true);
    try {
      const provider: ProviderConfig = {
        id: providerIdRef.current,
        type: providerType,
        name: name || providerTypeMessages.label,
        baseUrl,
        apiKey,
      };
      onSave(provider);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const upsertProviderInSettings = async (provider: ProviderConfig): Promise<void> => {
    const settings = await invoke<{ key: string; value: string }[]>('get_settings');
    const providersJson = settings.find((s) => s.key === 'llm_providers')?.value ?? '[]';
    const providers = JSON.parse(providersJson) as ProviderConfig[];
    const index = providers.findIndex((p) => p.id === provider.id);

    if (index >= 0) {
      providers[index] = provider;
    } else {
      providers.push(provider);
    }

    await invoke('set_setting', {
      key: 'llm_providers',
      value: JSON.stringify(providers),
    });
  };

  const loadProviderFromSettings = async (providerId: string): Promise<ProviderConfig | undefined> => {
    const settings = await invoke<{ key: string; value: string }[]>('get_settings');
    const providersJson = settings.find((s) => s.key === 'llm_providers')?.value ?? '[]';
    const providers = JSON.parse(providersJson) as ProviderConfig[];
    return providers.find((p) => p.id === providerId);
  };

  const handleOAuthLogin = async () => {
    setOauthLoading(true);
    try {
      const providerId = providerIdRef.current;
      const provider: ProviderConfig = {
        id: providerId,
        type: 'openai-oauth',
        name: name || llmMessages.providerTypes['openai-oauth'].label,
        baseUrl: baseUrl || preset.defaultBaseUrl,
        apiKey: '',
      };

      await upsertProviderInSettings(provider);

      const oauthResult = await invoke<{ authenticated: boolean; email: string | null }>('start_openai_oauth', {
        providerId,
      });

      if (!oauthResult.authenticated) {
        setOauthDone(false);
        setOauthEmail(null);
        setOauthStatusError(null);
        return;
      }

      const persistedProvider = await loadProviderFromSettings(providerId);
      const accessToken = persistedProvider?.apiKey ?? '';

      setApiKey(accessToken);
      setOauthDone(accessToken.length > 0);
      setOauthEmail(oauthResult.email ?? null);
      setOauthStatusError(null);

      setApiKey(accessToken);
      setOauthDone(accessToken.length > 0);
    } catch (error) {
      console.error('OAuth failed:', error);
      setOauthStatusError(error instanceof Error ? error.message : String(error));
    } finally {
      setOauthLoading(false);
    }
  };

  const openUrl = (url: string) => {
    if (isLocked) return;
    invoke('open_url', { url }).catch(console.error);
  };

  const canSave = () => {
    if (isOAuth) return apiKey.trim().length > 0 || oauthDone;
    if (preset.apiKeyRequired && !apiKey.trim()) return false;
    if (providerType === 'custom' && !baseUrl.trim()) return false;
    return true;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? providerModalMessages.editTitle : providerModalMessages.addTitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {providerModalMessages.cancel}
          </Button>
          <Button onClick={handleSave} isLoading={saving} disabled={isLocked || !canSave()}>
            {providerModalMessages.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={providerTypeId} className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            {providerModalMessages.typeLabel}
          </label>
          <select
            id={providerTypeId}
            value={providerType}
            onChange={(e) => setProviderType(e.target.value as ProviderType)}
            disabled={isEditing || isLocked}
            className={`w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:border-blue-500 ${
              isDark
                ? 'bg-slate-900 border-slate-700 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            } ${(isEditing || isLocked) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {Object.values(PROVIDER_PRESETS).map((p) => (
              <option key={p.type} value={p.type}>{llmMessages.providerTypes[p.type].label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={providerNameId} className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            {providerModalMessages.nameLabel}
          </label>
          <Input
            id={providerNameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={providerTypeMessages.label}
            disabled={isLocked}
          />
        </div>

        {isOAuth ? (
          <div>
            <p className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {providerModalMessages.oauthTitle}
            </p>
            {oauthDone || (isEditing && apiKey) ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-medium ${
                      oauthStatusError
                        ? (isDark ? 'text-rose-400' : 'text-rose-600')
                        : (isDark ? 'text-green-400' : 'text-green-600')
                    }`}
                  >
                    {oauthStatusError ? providerModalMessages.oauthError : providerModalMessages.oauthAuthenticated(oauthEmail)}
                  </span>
                  <Button variant="secondary" size="sm" onClick={handleOAuthLogin} isLoading={oauthLoading} disabled={isLocked}>
                    {providerModalMessages.reauthenticate}
                  </Button>
                </div>
                {oauthStatusError && (
                  <p className={`text-xs ${isDark ? 'text-rose-300' : 'text-rose-700'}`}>{oauthStatusError}</p>
                )}
              </div>
            ) : (
              <Button onClick={handleOAuthLogin} isLoading={oauthLoading} className="w-full" disabled={isLocked}>
                {providerModalMessages.login}
              </Button>
            )}
            <p className={`text-xs mt-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {providerModalMessages.oauthDescription}
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor={providerApiKeyId} className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {providerModalMessages.apiKeyLabel}{' '}
              {!preset.apiKeyRequired && <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>({providerModalMessages.optional})</span>}
            </label>
            {preset.apiKeyHelpUrl && (
              <p className={`text-xs mb-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <button
                  type="button"
                  onClick={() => openUrl(preset.apiKeyHelpUrl!)}
                  disabled={isLocked}
                  className="text-blue-400 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {providerTypeMessages.apiKeyHelpText}
                </button>
              </p>
            )}
            <Input
              id={providerApiKeyId}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={providerTypeMessages.apiKeyPlaceholder || providerModalMessages.apiKeyLabel}
              disabled={isLocked}
            />
          </div>
        )}

        {providerType === 'custom' && (
          <div>
            <label htmlFor={providerBaseUrlId} className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {providerModalMessages.baseUrlLabel}
            </label>
            <Input
              id={providerBaseUrlId}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={preset.defaultBaseUrl || 'https://...'}
              disabled={isLocked}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};
