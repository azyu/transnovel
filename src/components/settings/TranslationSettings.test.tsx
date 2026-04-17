import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { TranslationSettings } from './TranslationSettings';
import { messages } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  ask: vi.fn(),
}));

describe('TranslationSettings', () => {
  const invokeMock = vi.mocked(invoke);
  let container: HTMLDivElement;
  let root: Root;
  let originalSettingsMessages: unknown;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({ theme: 'dark' });
    originalSettingsMessages = messages.settings;
    invokeMock.mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    consoleErrorSpy.mockRestore();
    (messages as { settings: unknown }).settings = originalSettingsMessages;
    vi.clearAllMocks();
  });

  it('renders labels from settings i18n messages', async () => {
    const originalSettings = originalSettingsMessages as typeof messages.settings;
    (messages as { settings: unknown }).settings = {
      ...originalSettings,
      translation: {
        ...originalSettings.translation,
        title: 'Translation title sentinel',
        description: 'Translation description sentinel',
        systemPromptLabel: 'System prompt sentinel',
        resetPrompt: 'Reset prompt sentinel',
        autoProperNounToggleLabel: 'Proper noun toggle sentinel',
      },
    };

    await act(async () => {
      root.render(<TranslationSettings />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Translation title sentinel');
    expect(container.textContent).toContain('Translation description sentinel');
    expect(container.textContent).toContain('System prompt sentinel');
    expect(container.textContent).toContain('Reset prompt sentinel');
    expect(container.textContent).toContain('Proper noun toggle sentinel');
  });
});
