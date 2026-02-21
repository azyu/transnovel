import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUIStore } from '../../../stores/uiStore';
import type { ProviderConfig } from './types';
import { PROVIDER_PRESETS } from './types';

interface ProviderListProps {
  providers: ProviderConfig[];
  onEdit: (provider: ProviderConfig) => void;
  onDelete: (id: string) => void;
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
  const [status, setStatus] = useState<'checking' | 'authenticated' | 'expired'>('checking');

  useEffect(() => {
    invoke<{ authenticated: boolean }>('check_openai_oauth_status', { providerId })
      .then((r) => setStatus(r.authenticated ? 'authenticated' : 'expired'))
      .catch(() => setStatus('expired'));
  }, [providerId]);

  const label = status === 'checking' ? '...' : status === 'authenticated' ? '인증됨' : '만료됨';
  const color = status === 'authenticated'
    ? isDark ? 'text-green-400' : 'text-green-600'
    : isDark ? 'text-amber-400' : 'text-amber-600';

  return <span className={`text-xs ${color}`}>{label}</span>;
};

export const ProviderList: React.FC<ProviderListProps> = ({
  providers,
  onEdit,
  onDelete,
}) => {
  const isDark = useUIStore((state) => state.theme) === 'dark';

  const getProviderColor = (type: string): string => {
    const colors: Record<string, string> = {
      gemini: 'bg-blue-500/10 text-blue-400',
      openrouter: 'bg-purple-500/10 text-purple-400',
      anthropic: 'bg-orange-500/10 text-orange-400',
      openai: 'bg-green-500/10 text-green-400',
      'openai-oauth': 'bg-emerald-500/10 text-emerald-400',
      antigravity: 'bg-cyan-500/10 text-cyan-400',
      custom: 'bg-slate-500/10 text-slate-400',
    };
    return colors[type] || colors.custom;
  };

  const maskApiKey = (apiKey: string): string => {
    if (!apiKey) return '(없음)';
    if (apiKey.length <= 8) return '••••••••';
    return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`;
  };

  if (providers.length === 0) {
    return (
      <div className={`text-center py-8 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
        등록된 AI 서비스 제공자가 없습니다. 먼저 추가해주세요.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {providers.map((provider) => {
        const preset = PROVIDER_PRESETS[provider.type];
        
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
                {preset?.label || provider.type}
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
                onClick={() => onEdit(provider)}
                aria-label={`${provider.name} 수정`}
                className={`p-1.5 rounded-md transition-colors ${
                  isDark 
                    ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' 
                    : 'hover:bg-slate-200 text-slate-500 hover:text-slate-700'
                }`}
                title="수정"
              >
                <EditIcon />
              </button>
              <button
                type="button"
                onClick={() => onDelete(provider.id)}
                aria-label={`${provider.name} 삭제`}
                className={`p-1.5 rounded-md transition-colors ${
                  isDark 
                    ? 'hover:bg-red-900/30 text-slate-400 hover:text-red-400' 
                    : 'hover:bg-red-100 text-slate-500 hover:text-red-600'
                }`}
                title="삭제"
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
