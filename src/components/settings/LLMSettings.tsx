import { useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import type { ApiKey } from '../../types';

interface AntigravityStatus {
  running: boolean;
  authenticated: boolean;
  url: string;
}

interface GeminiModel {
  name: string;
  display_name: string;
  description: string;
  input_token_limit: number;
  output_token_limit: number;
}

interface AntigravityModel {
  id: string;
  name: string;
  provider: string;
}

const FALLBACK_GEMINI_MODELS: GeminiModel[] = [
  { name: 'gemini-2.5-flash-preview-05-20', display_name: 'Gemini 2.5 Flash Preview', description: '', input_token_limit: 1048576, output_token_limit: 65536 },
  { name: 'gemini-2.5-pro-preview-05-06', display_name: 'Gemini 2.5 Pro Preview', description: '', input_token_limit: 1048576, output_token_limit: 65536 },
];

const FALLBACK_ANTIGRAVITY_MODELS: AntigravityModel[] = [
  { id: 'claude-sonnet-4-5-20250514', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
];

export const LLMSettings = forwardRef((_, ref) => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [antigravityStatus, setAntigravityStatus] = useState<AntigravityStatus | null>(null);
  const [checkingAntigravity, setCheckingAntigravity] = useState(false);
  const [model, setModel] = useState('gemini-2.5-flash-preview-05-20');
  
  const [geminiModels, setGeminiModels] = useState<GeminiModel[]>(FALLBACK_GEMINI_MODELS);
  const [antigravityModels, setAntigravityModels] = useState<AntigravityModel[]>(FALLBACK_ANTIGRAVITY_MODELS);
  const [loadingGeminiModels, setLoadingGeminiModels] = useState(false);
  const [loadingAntigravityModels, setLoadingAntigravityModels] = useState(false);
  const [geminiModelsError, setGeminiModelsError] = useState<string | null>(null);
  const [antigravityModelsError, setAntigravityModelsError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    save: handleSaveModel
  }));

  const fetchKeys = async () => {
    try {
      const result = await invoke<ApiKey[]>('get_api_keys');
      setKeys(result);
      return result;
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
      return [];
    }
  };

  const fetchGeminiModels = useCallback(async (apiKey: string) => {
    setLoadingGeminiModels(true);
    setGeminiModelsError(null);
    try {
      const models = await invoke<GeminiModel[]>('fetch_gemini_models', { apiKey });
      if (models.length > 0) {
        const sorted = models.sort((a, b) => getModelScore(b.name) - getModelScore(a.name));
        setGeminiModels(sorted);
      }
    } catch (error) {
      console.error('Failed to fetch Gemini models:', error);
      setGeminiModelsError('모델 목록을 가져오지 못했습니다');
      setGeminiModels(FALLBACK_GEMINI_MODELS);
    } finally {
      setLoadingGeminiModels(false);
    }
  }, []);

  const fetchAntigravityModels = useCallback(async () => {
    setLoadingAntigravityModels(true);
    setAntigravityModelsError(null);
    try {
      const models = await invoke<AntigravityModel[]>('fetch_antigravity_models');
      if (models.length > 0) {
        const sorted = models.sort((a, b) => {
          const providerOrder: Record<string, number> = { anthropic: 3, google: 2, openai: 1 };
          return (providerOrder[b.provider] || 0) - (providerOrder[a.provider] || 0);
        });
        setAntigravityModels(sorted);
      }
    } catch (error) {
      console.error('Failed to fetch Antigravity models:', error);
      setAntigravityModelsError('프록시 모델 목록을 가져오지 못했습니다');
      setAntigravityModels(FALLBACK_ANTIGRAVITY_MODELS);
    } finally {
      setLoadingAntigravityModels(false);
    }
  }, []);

  const getModelScore = (name: string): number => {
    let score = 0;
    if (name.includes('pro')) score += 100;
    if (name.includes('flash')) score += 50;
    if (name.includes('2.5')) score += 30;
    if (name.includes('3.0') || name.includes('3-')) score += 40;
    if (name.includes('preview')) score += 10;
    if (name.includes('exp')) score += 5;
    return score;
  };

  const checkAntigravity = async () => {
    setCheckingAntigravity(true);
    try {
      const status = await invoke<AntigravityStatus>('check_antigravity_status');
      setAntigravityStatus(status);
      
      if (status.running && status.authenticated) {
        fetchAntigravityModels();
      }
    } catch (error) {
      console.error('Failed to check Antigravity status:', error);
      setAntigravityStatus({ running: false, authenticated: false, url: 'http://localhost:8080' });
    } finally {
      setCheckingAntigravity(false);
    }
  };

  const openAntigravityAuth = async () => {
    try {
      await invoke('open_antigravity_auth');
      setTimeout(checkAntigravity, 3000);
    } catch (error) {
      console.error('Failed to open auth:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const settings = await invoke<{ key: string; value: string }[]>('get_settings');
      const modelSetting = settings.find(s => s.key === 'selected_model');
      if (modelSetting) setModel(modelSetting.value);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      const fetchedKeys = await fetchKeys();
      await checkAntigravity();
      await loadSettings();
      
      const geminiKey = fetchedKeys.find(k => k.key_type === 'gemini');
      if (geminiKey) {
        fetchGeminiModels(geminiKey.api_key);
      }
    };
    init();
  }, [fetchGeminiModels]);

  const handleAddKey = async () => {
    if (!newKey.trim()) return;
    setIsLoading(true);
    try {
      await invoke('add_api_key', { keyType: 'gemini', apiKey: newKey });
      setNewKey('');
      const updatedKeys = await fetchKeys();
      
      if (geminiModels === FALLBACK_GEMINI_MODELS || geminiModels.length === FALLBACK_GEMINI_MODELS.length) {
        const geminiKey = updatedKeys.find(k => k.key_type === 'gemini');
        if (geminiKey) {
          fetchGeminiModels(geminiKey.api_key);
        }
      }
    } catch (error) {
      console.error('Failed to add API key:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveKey = async (id: number) => {
    if (!confirm('정말로 이 키를 삭제하시겠습니까?')) return;
    try {
      await invoke('remove_api_key', { id });
      await fetchKeys();
    } catch (error) {
      console.error('Failed to remove API key:', error);
    }
  };

  const handleSaveModel = async () => {
    try {
      await invoke('set_setting', { key: 'selected_model', value: model });
    } catch (error) {
      console.error('Failed to save model:', error);
    }
  };

  const handleRefreshGeminiModels = async () => {
    const geminiKey = keys.find(k => k.key_type === 'gemini');
    if (geminiKey) {
      fetchGeminiModels(geminiKey.api_key);
    }
  };

  const geminiKeys = keys.filter(k => k.key_type === 'gemini');

  const formatTokenLimit = (limit: number): string => {
    if (limit >= 1000000) return `${(limit / 1000000).toFixed(1)}M`;
    if (limit >= 1000) return `${(limit / 1000).toFixed(0)}K`;
    return limit.toString();
  };

  const getProviderBadge = (provider: string) => {
    const colors: Record<string, string> = {
      anthropic: 'bg-orange-500/10 text-orange-400',
      google: 'bg-blue-500/10 text-blue-400',
      openai: 'bg-green-500/10 text-green-400',
    };
    return colors[provider] || 'bg-slate-500/10 text-slate-400';
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-700 pb-4">
        <h2 className="text-xl font-semibold text-white">LLM 설정</h2>
        <p className="text-sm text-slate-400 mt-1">API 키 및 모델을 관리합니다.</p>
      </div>

      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white">사용 모델</h3>
          <div className="flex gap-2">
            {geminiKeys.length > 0 && (
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={handleRefreshGeminiModels}
                isLoading={loadingGeminiModels}
              >
                Gemini 새로고침
              </Button>
            )}
            {antigravityStatus?.authenticated && (
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={fetchAntigravityModels}
                isLoading={loadingAntigravityModels}
              >
                Antigravity 새로고침
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <optgroup label="Gemini (API 키 필요)">
                {geminiModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.display_name} ({formatTokenLimit(m.input_token_limit)} in / {formatTokenLimit(m.output_token_limit)} out)
                  </option>
                ))}
              </optgroup>
              {antigravityModels.length > 0 && (
                <optgroup label="Antigravity Proxy">
                  {antigravityModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.provider})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {(geminiModelsError || antigravityModelsError) && (
              <p className="mt-2 text-xs text-yellow-500">
                {geminiModelsError || antigravityModelsError}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Gemini 모델은 API 키가 필요하고, Antigravity 모델은 프록시 인증이 필요합니다.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h3 className="text-lg font-medium text-white mb-4">Gemini API 키</h3>
        <p className="text-sm text-slate-400 mb-4">
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
            Google AI Studio
          </a>
          에서 무료로 API 키를 발급받을 수 있습니다.
        </p>
        
        <div className="flex gap-4 items-end mb-6">
          <div className="flex-1">
            <Input
              label="API Key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="AIzaSy..."
            />
          </div>
          <Button onClick={handleAddKey} isLoading={isLoading} disabled={!newKey.trim()}>
            추가
          </Button>
        </div>

        <div className="space-y-3">
          {geminiKeys.map((key) => (
            <div key={key.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/10 text-blue-400">
                  GEMINI
                </span>
                <span className="text-sm text-slate-300 font-mono">
                  {key.api_key.substring(0, 12)}...{key.api_key.substring(key.api_key.length - 4)}
                </span>
              </div>
              <Button variant="danger" size="sm" onClick={() => handleRemoveKey(key.id)}>
                삭제
              </Button>
            </div>
          ))}
          {geminiKeys.length === 0 && (
            <div className="text-center py-4 text-slate-500 text-sm">
              등록된 API 키가 없습니다.
            </div>
          )}
        </div>
      </div>

      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <h3 className="text-lg font-medium text-white mb-4">Antigravity Proxy</h3>
        <p className="text-sm text-slate-400 mb-4">
          API 키 없이 Google OAuth로 번역할 수 있습니다. 아래 도구 중 하나를 설치하세요:
        </p>
        <ul className="text-sm text-slate-400 mb-4 list-disc list-inside space-y-1">
          <li>
            <a href="https://github.com/lbjlaq/Antigravity-Manager" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              Antigravity Manager
            </a>
            <span className="text-slate-500"> - GUI 앱 (추천, 포트 8045)</span>
          </li>
          <li>
            <a href="https://github.com/badrisnarayanan/antigravity-claude-proxy" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              antigravity-claude-proxy
            </a>
            <span className="text-slate-500"> - CLI (포트 8080 → 8045로 변경 필요)</span>
          </li>
        </ul>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              antigravityStatus?.running 
                ? antigravityStatus.authenticated 
                  ? 'bg-green-500' 
                  : 'bg-yellow-500'
                : 'bg-red-500'
            }`} />
            <span className="text-sm text-slate-300">
              {antigravityStatus?.running 
                ? antigravityStatus.authenticated 
                  ? '인증됨' 
                  : '인증 필요'
                : '미실행'}
            </span>
          </div>
          
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={checkAntigravity}
            isLoading={checkingAntigravity}
          >
            상태 확인
          </Button>
          
          {antigravityStatus?.running && !antigravityStatus.authenticated && (
            <Button size="sm" onClick={openAntigravityAuth}>
              Google 로그인
            </Button>
          )}
        </div>

        {antigravityStatus?.running && (
          <div className="mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
            <span className="text-sm text-slate-400">프록시 URL: </span>
            <span className="text-sm text-slate-300 font-mono">{antigravityStatus.url}</span>
          </div>
        )}

        {antigravityStatus?.authenticated && antigravityModels.length > 0 && (
          <div className="mt-4">
            <p className="text-sm text-slate-400 mb-2">사용 가능한 모델:</p>
            <div className="flex flex-wrap gap-2">
              {antigravityModels.slice(0, 8).map((m) => (
                <span
                  key={m.id}
                  className={`px-2 py-1 rounded text-xs font-medium ${getProviderBadge(m.provider)}`}
                >
                  {m.name}
                </span>
              ))}
              {antigravityModels.length > 8 && (
                <span className="px-2 py-1 rounded text-xs font-medium bg-slate-700 text-slate-400">
                  +{antigravityModels.length - 8} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

LLMSettings.displayName = 'LLMSettings';
