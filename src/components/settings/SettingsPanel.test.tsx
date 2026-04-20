import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPanel } from './SettingsPanel';
import { messages } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';

vi.mock('./LLMSettings', () => ({
  LLMSettings: () => <div>LLM Settings Stub</div>,
}));

vi.mock('./TranslationSettings', () => ({
  TranslationSettings: () => <div>Translation Settings Stub</div>,
}));

vi.mock('./ViewSettings', () => ({
  ViewSettings: () => <div>View Settings Stub</div>,
}));

vi.mock('./AdvancedSettings', () => ({
  AdvancedSettings: () => <div>Advanced Settings Stub</div>,
}));

vi.mock('./ApiLogsSettings', () => ({
  ApiLogsSettings: () => <div>API Logs Stub</div>,
}));

vi.mock('./AboutSettings', () => ({
  AboutSettings: () => <div>About Stub</div>,
}));

describe('SettingsPanel', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalSettingsMessages: unknown;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({ theme: 'dark' });
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

  it('renders tab labels from settings i18n messages', async () => {
    const originalSettings = originalSettingsMessages as typeof messages.settings;
    (messages as { settings: unknown }).settings = {
      ...originalSettings,
      tabs: {
        ...originalSettings.tabs,
        llm: 'LLM sentinel',
        translation: 'Translation sentinel',
        view: 'View sentinel',
        advanced: 'Advanced sentinel',
        apiLogs: 'API logs sentinel',
        about: 'About sentinel',
      },
    };

    await act(async () => {
      root.render(<SettingsPanel />);
    });

    expect(container.textContent).toContain('Translation sentinel');
    expect(container.textContent).toContain('View sentinel');
    expect(container.textContent).toContain('API logs sentinel');
    expect(container.textContent).toContain('About sentinel');
  });

  it('renders settings sub-tab labels in English when the UI language is English', async () => {
    useUIStore.setState({ theme: 'dark', language: 'en' });

    await act(async () => {
      root.render(<SettingsPanel />);
    });

    const buttonLabels = Array.from(container.querySelectorAll('nav button')).map((button) =>
      button.textContent?.trim(),
    );

    expect(buttonLabels).toEqual([
      'LLM',
      'Translation',
      'View',
      'Advanced',
      'API Logs',
      'About',
    ]);
  });
});
