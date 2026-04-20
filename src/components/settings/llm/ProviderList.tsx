import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUIStore } from '../../../stores/uiStore';
import type { ProviderConfig } from './types';
import { useSettingsMessages } from '../useSettingsMessages';

interface ProviderListProps {
  providers: ProviderConfig[];
  onEdit: (provider: ProviderConfig) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const DeleteIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const OAuthStatusBadge: React.FC<{ providerId: string }> = ({ providerId }) => {
  const isDark = useUIStore((state) => state.theme) === 'dark';
  const settingsMessages = useSettingsMessages();
  const oauthMessages = settingsMessages.llm.providerList.oauth;
  const [status, setStatus] = useState<'checking' | 'authenticated' | 'expired' | 'error'>('checking');
  const [email, setEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    invoke<{ authenticated: boolean; email: string | null }>('check_openai_oauth_status', { providerId })
      .then((r) => {
        setStatus(r.authenticated ? 'authenticated' : 'expired');
        setEmail(r.email ?? null);
        setErrorMessage(null);
      })
      .catch((error) => {
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : String(error));
      });
  }, [providerId]);

  if (status === 'checking') {
    return <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{oauthMessages.checking}</span>;
  }

  if (status === 'authenticated') {
    return (
      <span className={`text-xs ${isDark ? 'text-green-400' : 'text-green-600'}`}>
        {oauthMessages.authenticated(email)}
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span
      className={`text-xs ${isDark ? 'text-rose-400' : 'text-rose-600'}`}
      title={errorMessage ?? undefined}
    >
        {oauthMessages.error}
      </span>
    );
  }

  return <span className={`text-xs ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>{oauthMessages.loginRequired}</span>;
};

export const ProviderList: React.FC<ProviderListProps> = ({
  providers,
  onEdit,
  onDelete,
  disabled = false,
}) => {
  const isDark = useUIStore((state) => state.theme) === 'dark';
  const settingsMessages = useSettingsMessages();
  const llmMessages = settingsMessages.llm;
  const providerListMessages = llmMessages.providerList;

  const getProviderColor = (type: string): string => {
    const colors: Record<string, string> = {
      gemini: 'bg-blue-500/10 text-blue-400',
      openrouter: 'bg-purple-500/10 text-purple-400',
      anthropic: 'bg-orange-500/10 text-orange-400',
      openai: 'bg-green-500/10 text-green-400',
      'openai-oauth': 'bg-emerald-500/10 text-emerald-400',
      custom: 'bg-slate-500/10 text-slate-400',
    };
    return colors[type] || colors.custom;
  };

  const maskApiKey = (apiKey: string): string => {
    if (!apiKey) return providerListMessages.noApiKey;
    if (apiKey.length <= 8) return '••••••••';
    return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`;
  };

  if (providers.length === 0) {
    return (
      <div className={`text-center py-8 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
        {providerListMessages.empty}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {providers.map((provider) => {
        const providerTypeMessages = llmMessages.providerTypes[provider.type];
        
        return (
          <div
            key={provider.id}
            className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
              isDark 
                ? 'bg-slate-900/50 border-slate-700/50 hover:border-slate-600' 
                : 'bg-slate-50 border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${getProviderColor(provider.type)}`}>
                {providerTypeMessages?.label || provider.type}
              </span>
              
              <span className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {provider.name}
              </span>
              
              <span className={`text-xs truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {provider.type === 'openai-oauth' ? (
                  <OAuthStatusBadge providerId={provider.id} />
                ) : (
                  maskApiKey(provider.apiKey)
                )}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onEdit(provider)}
                aria-label={providerListMessages.actions.editAriaLabel(provider.name)}
                className={`p-1.5 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  isDark 
                    ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' 
                    : 'hover:bg-slate-200 text-slate-500 hover:text-slate-700'
                }`}
                title={providerListMessages.actions.editTitle}
              >
                <EditIcon />
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onDelete(provider.id)}
                aria-label={providerListMessages.actions.deleteAriaLabel(provider.name)}
                className={`p-1.5 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  isDark 
                    ? 'hover:bg-red-900/30 text-slate-400 hover:text-red-400' 
                    : 'hover:bg-red-100 text-slate-500 hover:text-red-600'
                }`}
                title={providerListMessages.actions.deleteTitle}
              >
                <DeleteIcon />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
