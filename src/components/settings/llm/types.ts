export type ProviderType = 'gemini' | 'openrouter' | 'anthropic' | 'openai' | 'antigravity' | 'custom';

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  apiKey: string;
  baseUrl: string;
}

export interface ModelConfig {
  id: string;
  name: string;
  providerId: string;
  modelId: string;
}

export interface ProviderPreset {
  type: ProviderType;
  label: string;
  defaultBaseUrl: string;
  apiKeyRequired: boolean;
  apiKeyPlaceholder: string;
  apiKeyHelpUrl?: string;
  apiKeyHelpText?: string;
}

export const PROVIDER_PRESETS: Record<ProviderType, ProviderPreset> = {
  gemini: {
    type: 'gemini',
    label: 'Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'AIzaSy...',
    apiKeyHelpUrl: 'https://aistudio.google.com/apikey',
    apiKeyHelpText: 'Google AI Studio에서 무료로 발급',
  },
  openrouter: {
    type: 'openrouter',
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'sk-or-...',
    apiKeyHelpUrl: 'https://openrouter.ai/keys',
    apiKeyHelpText: 'OpenRouter에서 발급',
  },
  anthropic: {
    type: 'anthropic',
    label: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'sk-ant-...',
    apiKeyHelpUrl: 'https://console.anthropic.com/settings/keys',
    apiKeyHelpText: 'Anthropic Console에서 발급',
  },
  openai: {
    type: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com',
    apiKeyRequired: true,
    apiKeyPlaceholder: 'sk-...',
    apiKeyHelpUrl: 'https://platform.openai.com/api-keys',
    apiKeyHelpText: 'OpenAI Platform에서 발급',
  },
  antigravity: {
    type: 'antigravity',
    label: 'Antigravity',
    defaultBaseUrl: 'http://127.0.0.1:8045',
    apiKeyRequired: false,
    apiKeyPlaceholder: '',
    apiKeyHelpText: 'API 키 없이 사용 가능 (Antigravity Manager 필요)',
  },
  custom: {
    type: 'custom',
    label: 'Custom',
    defaultBaseUrl: '',
    apiKeyRequired: false,
    apiKeyPlaceholder: '',
    apiKeyHelpText: 'OpenAI 호환 API 엔드포인트',
  },
};

export interface ModelOption {
  id: string;
  name: string;
  contextLength?: number;
}

export const FALLBACK_MODELS: Record<ProviderType, ModelOption[]> = {
  gemini: [
    { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash Preview' },
    { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro Preview' },
  ],
  openrouter: [
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', contextLength: 200000 },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', contextLength: 200000 },
    { id: 'openai/gpt-4o', name: 'GPT-4o', contextLength: 128000 },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  ],
  antigravity: [
    { id: 'claude-sonnet-4-5-20250514', name: 'Claude Sonnet 4.5' },
  ],
  custom: [],
};
