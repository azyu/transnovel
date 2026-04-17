import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderModal } from './ProviderModal';
import { messages } from '../../../i18n';
import { useUIStore } from '../../../stores/uiStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('../../common/Modal', () => ({
  Modal: ({ title, children, footer }: { title?: ReactNode; children: ReactNode; footer?: ReactNode }) => (
    <div>
      <div>{title}</div>
      <div>{children}</div>
      <div>{footer}</div>
    </div>
  ),
}));

const invokeMock = vi.mocked(invoke);

describe('ProviderModal', () => {
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

  it('shows an oauth configuration error when status lookup fails', async () => {
    invokeMock.mockRejectedValueOnce(new Error('config.yaml 파싱 실패'));

    await act(async () => {
      root.render(
        <ProviderModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          editingProvider={{
            id: 'provider-oauth',
            type: 'openai-oauth',
            name: 'ChatGPT',
            apiKey: 'oauth-token',
            baseUrl: '',
          }}
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('설정 오류');
    expect(container.textContent).toContain('config.yaml 파싱 실패');
  });

  it('requires both api key and base url for custom providers', async () => {
    await act(async () => {
      root.render(
        <ProviderModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          editingProvider={{
            id: 'provider-custom',
            type: 'custom',
            name: 'OpenAI-compatible',
            apiKey: '',
            baseUrl: 'https://example.com/v1',
          }}
        />,
      );
    });

    let saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('저장'),
    );

    expect(saveButton).toBeTruthy();
    expect(saveButton).toHaveProperty('disabled', true);

    await act(async () => {
      root.render(
        <ProviderModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          editingProvider={{
            id: 'provider-custom',
            type: 'custom',
            name: 'OpenAI-compatible',
            apiKey: 'sk-test',
            baseUrl: 'https://example.com/v1',
          }}
        />,
      );
    });

    saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('저장'),
    );
    expect(saveButton).toHaveProperty('disabled', false);
  });

  it('disables editing and save controls when the managed lock is active', async () => {
    await act(async () => {
      root.render(
        <ProviderModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          disabled
          editingProvider={{
            id: 'provider-custom',
            type: 'custom',
            name: 'OpenAI-compatible',
            apiKey: 'sk-test',
            baseUrl: 'https://example.com/v1',
          }}
        />,
      );
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('저장'),
    );
    expect(saveButton).toBeTruthy();
    expect(saveButton).toBeDisabled();

    const inputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThanOrEqual(3);
    expect(inputs[0]).toBeDisabled();
    expect(inputs[1]).toBeDisabled();
    expect(inputs[2]).toBeDisabled();
  });

  it('renders provider modal labels from settings i18n messages', async () => {
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
          custom: { label: 'Custom sentinel', apiKeyPlaceholder: 'Custom key sentinel', apiKeyHelpText: 'Custom help sentinel' },
        },
        providerModal: {
          addTitle: 'Add provider modal sentinel',
          editTitle: 'Edit provider modal sentinel',
          cancel: 'Cancel provider sentinel',
          save: 'Save provider sentinel',
          typeLabel: 'Type sentinel',
          nameLabel: 'Name sentinel',
          oauthTitle: 'OAuth title sentinel',
          oauthAuthenticated: (email: string | null) => (email ? `OAuth auth sentinel ${email}` : 'OAuth auth empty sentinel'),
          oauthError: 'OAuth error sentinel',
          reauthenticate: 'Reauth sentinel',
          login: 'Login sentinel',
          oauthDescription: 'OAuth description sentinel',
          apiKeyLabel: 'API key sentinel',
          optional: 'Optional sentinel',
          baseUrlLabel: 'Base URL sentinel',
        },
        providerList: {
          empty: 'Empty provider sentinel',
          noApiKey: '(No key sentinel)',
          oauth: {
            checking: 'Checking sentinel',
            authenticated: (email: string | null) => (email ? `Auth sentinel ${email}` : 'Auth no email sentinel'),
            error: 'OAuth error list sentinel',
            loginRequired: 'Login required sentinel',
          },
          actions: {
            editTitle: 'Edit action sentinel',
            deleteTitle: 'Delete action sentinel',
            editAriaLabel: (name: string) => `${name} edit sentinel`,
            deleteAriaLabel: (name: string) => `${name} delete sentinel`,
          },
          missingProvider: 'Missing provider sentinel',
        },
      },
    };

    await act(async () => {
      root.render(
        <ProviderModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          editingProvider={{
            id: 'provider-custom',
            type: 'custom',
            name: 'OpenAI-compatible',
            apiKey: '',
            baseUrl: 'https://example.com/v1',
          }}
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Edit provider modal sentinel');
    expect(container.textContent).toContain('Name sentinel');
    expect(container.textContent).toContain('API key sentinel');
    expect(container.textContent).toContain('Base URL sentinel');
    expect(container.textContent).toContain('Cancel provider sentinel');
    expect(container.textContent).toContain('Save provider sentinel');

    const inputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs.some((input) => input.placeholder === 'Custom key sentinel')).toBe(true);
  });
});
