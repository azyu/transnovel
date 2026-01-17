import { useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { SearchableSelect } from '../common/SearchableSelect';
import { useAppStore } from '../../stores/appStore';
import type { ApiKey } from '../../types';

const DEFAULT_PROXY_URL = 'http://127.0.0.1:8045';

type Provider = 'gemini' | 'openrouter' | 'antigravity';

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

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
}

const FALLBACK_GEMINI_MODELS: GeminiModel[] = [
  { name: 'gemini-2.5-flash-preview-05-20', display_name: 'Gemini 2.5 Flash Preview', description: '', input_token_limit: 1048576, output_token_limit: 65536 },
  { name: 'gemini-2.5-pro-preview-05-06', display_name: 'Gemini 2.5 Pro Preview', description: '', input_token_limit: 1048576, output_token_limit: 65536 },
];

const FALLBACK_ANTIGRAVITY_MODELS: AntigravityModel[] = [
  { id: 'claude-sonnet-4-5-20250514', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
];

const FALLBACK_OPENROUTER_MODELS: OpenRouterModel[] = [
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', context_length: 200000 },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', context_length: 200000 },
  { id: 'openai/gpt-4o', name: 'GPT-4o', context_length: 128000 },
  { id: 'google/gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash', context_length: 1000000 },
];

export const LLMSettings = forwardRef((_, ref) => {
  const { theme } = useAppStore();
  const isDark = theme === 'dark';
  
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [activeProvider, setActiveProvider] = useState<Provider>('gemini');
  
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash-preview-05-20');
  const [geminiModels, setGeminiModels] = useState<GeminiModel[]>(FALLBACK_GEMINI_MODELS);
  const [loadingGeminiModels, setLoadingGeminiModels] = useState(false);
  const [newGeminiKey, setNewGeminiKey] = useState('');
  const [addingGeminiKey, setAddingGeminiKey] = useState(false);
  
  const [openrouterModel, setOpenrouterModel] = useState('anthropic/claude-sonnet-4');
  const [openrouterModels, setOpenrouterModels] = useState<OpenRouterModel[]>(FALLBACK_OPENROUTER_MODELS);
  const [loadingOpenrouterModels, setLoadingOpenrouterModels] = useState(false);
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [savingOpenrouter, setSavingOpenrouter] = useState(false);
  
  const [antigravityModel, setAntigravityModel] = useState('claude-sonnet-4-5-20250514');
  const [antigravityModels, setAntigravityModels] = useState<AntigravityModel[]>(FALLBACK_ANTIGRAVITY_MODELS);
  const [loadingAntigravityModels, setLoadingAntigravityModels] = useState(false);
  const [antigravityStatus, setAntigravityStatus] = useState<AntigravityStatus | null>(null);
  const [checkingAntigravity, setCheckingAntigravity] = useState(false);
  const [proxyUrl, setProxyUrl] = useState(DEFAULT_PROXY_URL);
  const [useStreaming, setUseStreaming] = useState(true);

  useImperativeHandle(ref, () => ({
    save: handleSaveAll
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
    try {
      const models = await invoke<GeminiModel[]>('fetch_gemini_models', { apiKey });
      if (models.length > 0) {
        const sorted = models.sort((a, b) => getModelScore(b.name) - getModelScore(a.name));
        setGeminiModels(sorted);
      }
    } catch (error) {
      console.error('Failed to fetch Gemini models:', error);
      setGeminiModels(FALLBACK_GEMINI_MODELS);
    } finally {
      setLoadingGeminiModels(false);
    }
  }, []);

  const fetchAntigravityModels = useCallback(async (url?: string) => {
    setLoadingAntigravityModels(true);
    try {
      const models = await invoke<AntigravityModel[]>('fetch_antigravity_models', { url: url || proxyUrl });
      if (models.length > 0) {
        const sorted = models.sort((a, b) => {
          const providerOrder: Record<string, number> = { anthropic: 3, google: 2, openai: 1 };
          return (providerOrder[b.provider] || 0) - (providerOrder[a.provider] || 0);
        });
        setAntigravityModels(sorted);
      }
    } catch (error) {
      console.error('Failed to fetch Antigravity models:', error);
      setAntigravityModels(FALLBACK_ANTIGRAVITY_MODELS);
    } finally {
      setLoadingAntigravityModels(false);
    }
  }, [proxyUrl]);

  const fetchOpenrouterModels = useCallback(async (apiKey: string) => {
    setLoadingOpenrouterModels(true);
    try {
      const models = await invoke<OpenRouterModel[]>('fetch_openrouter_models', { apiKey });
      if (models.length > 0) {
        setOpenrouterModels(models);
      }
    } catch (error) {
      console.error('Failed to fetch OpenRouter models:', error);
      setOpenrouterModels(FALLBACK_OPENROUTER_MODELS);
    } finally {
      setLoadingOpenrouterModels(false);
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

  const checkAntigravity = async (url?: string) => {
    const targetUrl = url || proxyUrl;
    setCheckingAntigravity(true);
    try {
      const status = await invoke<AntigravityStatus>('check_antigravity_status', { url: targetUrl });
      setAntigravityStatus(status);
      
      if (status.running && status.authenticated) {
        fetchAntigravityModels(targetUrl);
      }
    } catch (error) {
      console.error('Failed to check Antigravity status:', error);
      setAntigravityStatus({ running: false, authenticated: false, url: targetUrl });
    } finally {
      setCheckingAntigravity(false);
    }
  };

  const openAntigravityAuth = async () => {
    try {
      await invoke('open_antigravity_auth', { url: proxyUrl });
      setTimeout(() => checkAntigravity(), 3000);
    } catch (error) {
      console.error('Failed to open auth:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const settings = await invoke<{ key: string; value: string }[]>('get_settings');
      
      const activeProviderSetting = settings.find(s => s.key === 'active_provider');
      if (activeProviderSetting && ['gemini', 'openrouter', 'antigravity'].includes(activeProviderSetting.value)) {
        setActiveProvider(activeProviderSetting.value as Provider);
      }
      
      const geminiModelSetting = settings.find(s => s.key === 'gemini_model');
      if (geminiModelSetting?.value) setGeminiModel(geminiModelSetting.value);
      
      const openrouterModelSetting = settings.find(s => s.key === 'openrouter_model');
      if (openrouterModelSetting?.value) setOpenrouterModel(openrouterModelSetting.value);
      
      const antigravityModelSetting = settings.find(s => s.key === 'antigravity_model');
      if (antigravityModelSetting?.value) setAntigravityModel(antigravityModelSetting.value);
      
      const proxyUrlSetting = settings.find(s => s.key === 'antigravity_proxy_url');
      if (proxyUrlSetting?.value) setProxyUrl(proxyUrlSetting.value);
      
      const useStreamingSetting = settings.find(s => s.key === 'use_streaming');
      if (useStreamingSetting?.value) setUseStreaming(useStreamingSetting.value === 'true');
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

      const openrouterApiKey = fetchedKeys.find(k => k.key_type === 'openrouter');
      if (openrouterApiKey) {
        setOpenrouterKey(openrouterApiKey.api_key);
        fetchOpenrouterModels(openrouterApiKey.api_key);
      }
    };
    init();
  }, [fetchGeminiModels, fetchOpenrouterModels]);

  const handleAddGeminiKey = async () => {
    if (!newGeminiKey.trim()) return;
    setAddingGeminiKey(true);
    try {
      await invoke('add_api_key', { keyType: 'gemini', apiKey: newGeminiKey });
      setNewGeminiKey('');
      const updatedKeys = await fetchKeys();
      
      const geminiKey = updatedKeys.find(k => k.key_type === 'gemini');
      if (geminiKey) {
        fetchGeminiModels(geminiKey.api_key);
      }
    } catch (error) {
      console.error('Failed to add API key:', error);
    } finally {
      setAddingGeminiKey(false);
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

  const handleSaveAll = async () => {
    try {
      await Promise.all([
        invoke('set_setting', { key: 'active_provider', value: activeProvider }),
        invoke('set_setting', { key: 'gemini_model', value: geminiModel }),
        invoke('set_setting', { key: 'openrouter_model', value: openrouterModel }),
        invoke('set_setting', { key: 'antigravity_model', value: antigravityModel }),
        invoke('set_setting', { key: 'antigravity_proxy_url', value: proxyUrl }),
        invoke('set_setting', { key: 'use_streaming', value: useStreaming ? 'true' : 'false' }),
      ]);
      window.dispatchEvent(new Event('settings-changed'));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const handleAddOpenrouterKey = async () => {
    if (!openrouterKey.trim()) return;
    setSavingOpenrouter(true);
    try {
      const existingKey = keys.find(k => k.key_type === 'openrouter');
      if (existingKey) {
        await invoke('remove_api_key', { id: existingKey.id });
      }
      await invoke('add_api_key', { keyType: 'openrouter', apiKey: openrouterKey });
      await fetchKeys();
      fetchOpenrouterModels(openrouterKey);
    } catch (error) {
      console.error('Failed to save OpenRouter key:', error);
    } finally {
      setSavingOpenrouter(false);
    }
  };

  const handleRemoveOpenrouterKey = async () => {
    const existingKey = keys.find(k => k.key_type === 'openrouter');
    if (existingKey) {
      await invoke('remove_api_key', { id: existingKey.id });
      setOpenrouterKey('');
      await fetchKeys();
    }
  };

  const openUrl = (url: string) => {
    invoke('open_url', { url }).catch(console.error);
  };

  const handleRefreshGeminiModels = async () => {
    const geminiKey = keys.find(k => k.key_type === 'gemini');
    if (geminiKey) {
      fetchGeminiModels(geminiKey.api_key);
    }
  };

  const geminiKeys = keys.filter(k => k.key_type === 'gemini');
  const openrouterKeys = keys.filter(k => k.key_type === 'openrouter');

  const formatTokenLimit = (limit: number): string => {
    if (limit >= 1000000) return `${(limit / 1000000).toFixed(1)}M`;
    if (limit >= 1000) return `${(limit / 1000).toFixed(0)}K`;
    return limit.toString();
  };

  const RadioButton = ({ provider, label }: { provider: Provider; label: string }) => (
    <button
      onClick={() => setActiveProvider(provider)}
      className="flex items-center gap-3"
    >
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
        activeProvider === provider
          ? 'border-blue-500 bg-blue-500'
          : isDark ? 'border-slate-600' : 'border-slate-300'
      }`}>
        {activeProvider === provider && (
          <div className="w-2 h-2 rounded-full bg-white" />
        )}
      </div>
      <span className={`text-lg font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{label}</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className={`border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>LLM 설정</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>사용할 API와 모델을 선택합니다. 하나만 활성화할 수 있습니다.</p>
      </div>

      <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>스트리밍 모드</h3>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              번역 결과를 실시간으로 표시합니다. 끄면 전체 완료 후 한번에 표시됩니다.
            </p>
          </div>
          <button
            onClick={() => setUseStreaming(!useStreaming)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              useStreaming ? 'bg-blue-500' : isDark ? 'bg-slate-600' : 'bg-slate-300'
            }`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
              useStreaming ? 'translate-x-7' : 'translate-x-1'
            }`} />
          </button>
        </div>
      </div>

      <div className={`p-6 rounded-xl border ${
        activeProvider === 'gemini'
          ? 'border-blue-500 ring-1 ring-blue-500/20'
          : isDark ? 'border-slate-700' : 'border-slate-200'
      } ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <RadioButton provider="gemini" label="Gemini API" />
          {geminiKeys.length > 0 && (
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={handleRefreshGeminiModels}
              isLoading={loadingGeminiModels}
            >
              모델 새로고침
            </Button>
          )}
        </div>
        
        <p className={`text-sm mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          <button onClick={() => openUrl('https://aistudio.google.com/apikey')} className="text-blue-400 hover:underline">
            Google AI Studio
          </button>
          에서 무료로 API 키를 발급받을 수 있습니다.
        </p>

        <div className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Input
                label="API Key"
                value={newGeminiKey}
                onChange={(e) => setNewGeminiKey(e.target.value)}
                placeholder="AIzaSy..."
              />
            </div>
            <Button onClick={handleAddGeminiKey} isLoading={addingGeminiKey} disabled={!newGeminiKey.trim()}>
              추가
            </Button>
          </div>

          {geminiKeys.length > 0 && (
            <div className="space-y-2">
              {geminiKeys.map((key) => (
                <div key={key.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                  isDark ? 'bg-slate-900/50 border-slate-700/50' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/10 text-blue-400">
                      GEMINI
                    </span>
                    <span className={`text-sm font-mono ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {key.api_key.substring(0, 12)}...{key.api_key.substring(key.api_key.length - 4)}
                    </span>
                  </div>
                  <Button variant="danger" size="sm" onClick={() => handleRemoveKey(key.id)}>
                    삭제
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>모델</label>
            <SearchableSelect
              options={geminiModels.map((m) => ({
                value: m.name,
                label: m.display_name,
                subLabel: `${formatTokenLimit(m.input_token_limit)} in / ${formatTokenLimit(m.output_token_limit)} out`,
              }))}
              value={geminiModel}
              onChange={setGeminiModel}
              loading={loadingGeminiModels}
              placeholder="모델 검색..."
            />
          </div>
        </div>
      </div>

      <div className={`p-6 rounded-xl border ${
        activeProvider === 'openrouter'
          ? 'border-blue-500 ring-1 ring-blue-500/20'
          : isDark ? 'border-slate-700' : 'border-slate-200'
      } ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <RadioButton provider="openrouter" label="OpenRouter API" />
        </div>
        
        <p className={`text-sm mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          <button onClick={() => openUrl('https://openrouter.ai/keys')} className="text-blue-400 hover:underline">
            OpenRouter
          </button>
          에서 API 키를 발급받아 다양한 모델 (Claude, GPT-4, Llama 등)을 사용할 수 있습니다.
        </p>

        <div className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Input
                label="API Key"
                value={openrouterKey}
                onChange={(e) => setOpenrouterKey(e.target.value)}
                placeholder="sk-or-..."
                type="password"
              />
            </div>
            <Button onClick={handleAddOpenrouterKey} isLoading={savingOpenrouter} disabled={!openrouterKey.trim()}>
              {openrouterKeys.length > 0 ? '업데이트' : '추가'}
            </Button>
          </div>

          {openrouterKeys.length > 0 && (
            <div className="space-y-2">
              {openrouterKeys.map((key) => (
                <div key={key.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                  isDark ? 'bg-slate-900/50 border-slate-700/50' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-purple-500/10 text-purple-400">
                      OPENROUTER
                    </span>
                    <span className={`text-sm font-mono ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {key.api_key.substring(0, 12)}...{key.api_key.substring(key.api_key.length - 4)}
                    </span>
                  </div>
                  <Button variant="danger" size="sm" onClick={handleRemoveOpenrouterKey}>
                    삭제
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>모델</label>
            <SearchableSelect
              options={openrouterModels.map((m) => ({
                value: m.id,
                label: m.name,
                subLabel: `${Math.round(m.context_length / 1000)}K`,
              }))}
              value={openrouterModel}
              onChange={setOpenrouterModel}
              loading={loadingOpenrouterModels}
              placeholder="모델 검색..."
            />
            <p className={`mt-2 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              더 많은 모델은 <button onClick={() => openUrl('https://openrouter.ai/models')} className="text-blue-400 hover:underline">OpenRouter Models</button>에서 확인
            </p>
          </div>
        </div>
      </div>

      <div className={`p-6 rounded-xl border ${
        activeProvider === 'antigravity'
          ? 'border-blue-500 ring-1 ring-blue-500/20'
          : isDark ? 'border-slate-700' : 'border-slate-200'
      } ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <RadioButton provider="antigravity" label="Antigravity Proxy" />
          {antigravityStatus?.authenticated && (
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={() => fetchAntigravityModels()}
              isLoading={loadingAntigravityModels}
            >
              모델 새로고침
            </Button>
          )}
        </div>
        
        <p className={`text-sm mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          API 키 없이 Google OAuth로 번역할 수 있습니다.
        </p>
        <ul className={`text-sm mb-4 list-disc list-inside space-y-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          <li>
            <button onClick={() => openUrl('https://github.com/lbjlaq/Antigravity-Manager')} className="text-blue-400 hover:underline">
              Antigravity Manager
            </button>
            <span className={isDark ? 'text-slate-500' : 'text-slate-400'}> - GUI 앱 (추천)</span>
          </li>
          <li>
            <button onClick={() => openUrl('https://github.com/badrisnarayanan/antigravity-claude-proxy')} className="text-blue-400 hover:underline">
              antigravity-claude-proxy
            </button>
            <span className={isDark ? 'text-slate-500' : 'text-slate-400'}> - CLI</span>
          </li>
        </ul>

        <div className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Input
                label="프록시 URL"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                placeholder="http://127.0.0.1:8045"
              />
            </div>
            <Button 
              variant="secondary" 
              onClick={() => checkAntigravity()}
              isLoading={checkingAntigravity}
            >
              상태 확인
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                antigravityStatus?.running 
                  ? antigravityStatus.authenticated 
                    ? 'bg-green-500' 
                    : 'bg-yellow-500'
                  : 'bg-red-500'
              }`} />
              <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {antigravityStatus?.running 
                  ? antigravityStatus.authenticated 
                    ? '인증됨' 
                    : '인증 필요'
                  : '미실행'}
              </span>
            </div>
            
            {antigravityStatus?.running && !antigravityStatus.authenticated && (
              <Button size="sm" onClick={openAntigravityAuth}>
                Google 로그인
              </Button>
            )}
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>모델</label>
            <SearchableSelect
              options={antigravityModels.map((m) => ({
                value: m.id,
                label: `${m.name} (${m.provider})`,
              }))}
              value={antigravityModel}
              onChange={setAntigravityModel}
              placeholder="모델 선택..."
            />
          </div>
        </div>
      </div>
    </div>
  );
});

LLMSettings.displayName = 'LLMSettings';
