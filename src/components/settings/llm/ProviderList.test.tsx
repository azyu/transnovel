import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderList } from './ProviderList';
import { messages } from '../../../i18n';
import type { ProviderConfig } from './types';
import { useUIStore } from '../../../stores/uiStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe('ProviderList', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalSettingsMessages: unknown;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({ theme: 'dark', viewConfigVersion: 0 });
    originalSettingsMessages = messages.settings;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    (messages as { settings: unknown }).settings = originalSettingsMessages;
    vi.clearAllMocks();
  });

  it('shows an oauth configuration error badge when status lookup fails', async () => {
    invokeMock.mockRejectedValueOnce(new Error('config.yaml 파싱 실패'));

    const providers: ProviderConfig[] = [
      {
        id: 'provider-oauth',
        type: 'openai-oauth',
        name: 'ChatGPT',
        apiKey: 'oauth-token',
        baseUrl: '',
      },
    ];

    await act(async () => {
      root.render(
        <ProviderList
          providers={providers}
          onEdit={() => {}}
          onDelete={() => {}}
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('설정 오류');
  });

  it('renders provider list labels from settings i18n messages', async () => {
    const originalSettings = originalSettingsMessages as typeof messages.settings;
    (messages as { settings: unknown }).settings = {
      ...originalSettings,
      llm: {
        providerTypes: {
          gemini: { label: 'Gemini sentinel', apiKeyPlaceholder: 'AIza sentinel', apiKeyHelpText: 'Gemini help sentinel' },
          openrouter: { label: 'OpenRouter sentinel', apiKeyPlaceholder: 'sk-or sentinel', apiKeyHelpText: 'OpenRouter help sentinel' },
          anthropic: { label: 'Anthropic sentinel', apiKeyPlaceholder: 'sk-ant sentinel', apiKeyHelpText: 'Anthropic help sentinel' },
          openai: { label: 'OpenAI sentinel', apiKeyPlaceholder: 'sk sentinel', apiKeyHelpText: 'OpenAI help sentinel' },
          'openai-oauth': { label: 'OAuth sentinel', apiKeyPlaceholder: '', apiKeyHelpText: 'OAuth help sentinel' },
          custom: { label: 'Custom sentinel', apiKeyPlaceholder: 'API sentinel', apiKeyHelpText: 'Custom help sentinel' },
        },
        providerList: {
          empty: 'Empty provider sentinel',
          noApiKey: '(No key sentinel)',
          oauth: {
            checking: 'Checking sentinel',
            authenticated: (email: string | null) => (email ? `Auth sentinel ${email}` : 'Auth no email sentinel'),
            error: 'OAuth error sentinel',
            loginRequired: 'Login required sentinel',
          },
          actions: {
            editTitle: 'Edit sentinel',
            deleteTitle: 'Delete sentinel',
            editAriaLabel: (name: string) => `${name} edit sentinel`,
            deleteAriaLabel: (name: string) => `${name} delete sentinel`,
          },
          missingProvider: 'Missing provider sentinel',
        },
      },
    };

    invokeMock.mockResolvedValueOnce({ authenticated: false, email: null });

    const providers: ProviderConfig[] = [
      {
        id: 'provider-1',
        type: 'custom',
        name: 'Provider A',
        apiKey: '',
        baseUrl: 'https://example.com/v1',
      },
      {
        id: 'provider-2',
        type: 'openai-oauth',
        name: 'Provider OAuth',
        apiKey: 'oauth-token',
        baseUrl: '',
      },
    ];

    await act(async () => {
      root.render(
        <ProviderList
          providers={providers}
          onEdit={() => {}}
          onDelete={() => {}}
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('(No key sentinel)');
    expect(container.textContent).toContain('Login required sentinel');
    expect(container.textContent).toContain('Custom sentinel');

    const editButton = container.querySelector('button[aria-label="Provider A edit sentinel"]');
    const deleteButton = container.querySelector('button[aria-label="Provider A delete sentinel"]');
    expect(editButton).toBeTruthy();
    expect(deleteButton).toBeTruthy();
    expect(editButton?.getAttribute('title')).toBe('Edit sentinel');
    expect(deleteButton?.getAttribute('title')).toBe('Delete sentinel');
  });
});
