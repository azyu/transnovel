import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelModal } from './ModelModal';
import { messages } from '../../../i18n';
import type { ProviderConfig } from './types';
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

describe('ModelModal', () => {
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

  it('guides manual model input for custom providers', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'provider-custom',
        type: 'custom',
        name: 'OpenAI-compatible',
        apiKey: 'sk-test',
        baseUrl: 'https://example.com/v1',
      },
    ];

    await act(async () => {
      root.render(
        <ModelModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          providers={providers}
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const refreshButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('↻'),
    );

    expect(container.textContent).toContain('모델 ID를 직접 입력');
    expect(refreshButton).toHaveProperty('disabled', true);
  });

  it('disables edit and save controls when the managed lock is active', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'provider-openrouter',
        type: 'openrouter',
        name: 'OpenRouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api',
      },
    ];

    await act(async () => {
      root.render(
        <ModelModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          disabled
          editingModel={{
            id: 'model-1',
            name: 'Model A',
            providerId: 'provider-openrouter',
            modelId: 'openai/gpt-4o',
          }}
          providers={providers}
        />,
      );
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('저장'),
    );
    expect(saveButton).toBeTruthy();
    expect(saveButton).toBeDisabled();

    const refreshButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('↻'),
    );
    expect(refreshButton).toBeTruthy();
    expect(refreshButton).toBeDisabled();

    const inputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    expect(inputs[0]).toBeDisabled();
    expect(inputs[1]).toBeDisabled();
  });

  it('renders model modal labels from settings i18n messages', async () => {
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
        modelModal: {
          addTitle: 'Add model sentinel',
          editTitle: 'Edit model sentinel',
          cancel: 'Cancel model sentinel',
          save: 'Save model sentinel',
          providerLabel: 'Provider label sentinel',
          noProviders: 'No providers sentinel',
          modelIdLabel: 'Model ID sentinel',
          modelIdPlaceholder: 'Model ID placeholder sentinel',
          refreshModels: 'Refresh models sentinel',
          manualEntryHint: 'Manual entry sentinel',
          displayNameLabel: 'Display name sentinel',
          optional: 'Optional model sentinel',
          displayNameAutoPlaceholder: 'Auto display sentinel',
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

    const providers: ProviderConfig[] = [
      {
        id: 'provider-custom',
        type: 'custom',
        name: 'OpenAI-compatible',
        apiKey: 'sk-test',
        baseUrl: 'https://example.com/v1',
      },
    ];

    await act(async () => {
      root.render(
        <ModelModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          providers={providers}
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Add model sentinel');
    expect(container.textContent).toContain('Provider label sentinel');
    expect(container.textContent).toContain('Model ID sentinel');
    expect(container.textContent).toContain('Manual entry sentinel');
    expect(container.textContent).toContain('Display name sentinel');
    expect(container.textContent).toContain('Cancel model sentinel');
    expect(container.textContent).toContain('Save model sentinel');

    const inputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs.some((input) => input.placeholder === 'Model ID placeholder sentinel')).toBe(true);
    expect(inputs.some((input) => input.placeholder === 'Auto display sentinel')).toBe(true);
  });
});
