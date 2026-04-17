import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelList } from './ModelList';
import { messages } from '../../../i18n';
import type { ModelConfig, ProviderConfig } from './types';
import { useUIStore } from '../../../stores/uiStore';

describe('ModelList', () => {
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

  it('renders model list labels from settings i18n messages', async () => {
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
        modelList: {
          empty: 'Empty model sentinel',
          missingProvider: 'Missing provider sentinel',
          actions: {
            editTitle: 'Edit model action sentinel',
            deleteTitle: 'Delete model action sentinel',
            editAriaLabel: (name: string) => `${name} edit model sentinel`,
            deleteAriaLabel: (name: string) => `${name} delete model sentinel`,
          },
        },
      },
    };

    const models: ModelConfig[] = [
      {
        id: 'model-1',
        name: 'Model A',
        providerId: 'missing-provider',
        modelId: 'gpt-4o',
      },
    ];
    const providers: ProviderConfig[] = [];

    await act(async () => {
      root.render(
        <ModelList
          models={models}
          providers={providers}
          activeModelId={null}
          onSelect={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />,
      );
    });

    expect(container.textContent).toContain('Missing provider sentinel');

    const editButton = container.querySelector('button[aria-label="Model A edit model sentinel"]');
    const deleteButton = container.querySelector('button[aria-label="Model A delete model sentinel"]');
    expect(editButton).toBeTruthy();
    expect(deleteButton).toBeTruthy();
    expect(editButton?.getAttribute('title')).toBe('Edit model action sentinel');
    expect(deleteButton?.getAttribute('title')).toBe('Delete model action sentinel');
  });
});
