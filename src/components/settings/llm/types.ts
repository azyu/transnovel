export type ProviderType = 'gemini' | 'openrouter' | 'anthropic' | 'openai' | 'openai-oauth' | 'custom';

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
  defaultBaseUrl: string;
  apiKeyRequired: boolean;
  apiKeyHelpUrl?: string;
}

export const PROVIDER_PRESETS: Record<ProviderType, ProviderPreset> = {
  gemini: {
    type: 'gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    apiKeyRequired: true,
    apiKeyHelpUrl: 'https://aistudio.google.com/apikey',
  },
  openrouter: {
    type: 'openrouter',
    defaultBaseUrl: 'https://openrouter.ai/api',
    apiKeyRequired: true,
    apiKeyHelpUrl: 'https://openrouter.ai/keys',
  },
  anthropic: {
    type: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    apiKeyRequired: true,
    apiKeyHelpUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    type: 'openai',
    defaultBaseUrl: 'https://api.openai.com',
    apiKeyRequired: true,
    apiKeyHelpUrl: 'https://platform.openai.com/api-keys',
  },
  'openai-oauth': {
    type: 'openai-oauth',
    defaultBaseUrl: 'https://chatgpt.com',
    apiKeyRequired: false,
  },
  custom: {
    type: 'custom',
    defaultBaseUrl: '',
    apiKeyRequired: true,
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
    { id: 'openai/gpt-5.2', name: 'GPT-5.2', contextLength: 400000 },
    { id: 'openai/gpt-4o', name: 'GPT-4o', contextLength: 128000 },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  ],
  openai: [
    { id: 'gpt-5.2', name: 'GPT-5.2', contextLength: 400000 },
    { id: 'gpt-5', name: 'GPT-5', contextLength: 400000 },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', contextLength: 400000 },
    { id: 'gpt-4o', name: 'GPT-4o', contextLength: 128000 },
  ],
  'openai-oauth': [
    { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', contextLength: 400000 },
    { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', contextLength: 400000 },
    { id: 'gpt-5-codex', name: 'GPT-5 Codex', contextLength: 400000 },
    { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', contextLength: 400000 },
    { id: 'codex-mini-latest', name: 'Codex Mini Latest', contextLength: 400000 },
  ],
  custom: [],
};
