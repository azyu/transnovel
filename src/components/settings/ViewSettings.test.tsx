import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { ViewSettings } from './ViewSettings';
import { messages } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  ask: vi.fn(),
}));

describe('ViewSettings', () => {
  const invokeMock = vi.mocked(invoke);
  let container: HTMLDivElement;
  let root: Root;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalSettingsMessages: unknown;

  beforeEach(() => {
    vi.useFakeTimers();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useUIStore.setState({ theme: 'dark', viewConfigVersion: 0 });
    originalSettingsMessages = messages.settings;

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_settings') {
        throw new Error('load failed');
      }
      return undefined;
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    consoleErrorSpy.mockRestore();
    (messages as { settings: unknown }).settings = originalSettingsMessages;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('saves changes even if initial settings load fails', async () => {
    const originalSettings = originalSettingsMessages as typeof messages.settings;
    (messages as { settings: unknown }).settings = {
      ...originalSettings,
      view: {
        ...originalSettings.view,
        presets: {
          ...originalSettings.view.presets,
          dark: 'Dark preset sentinel',
          sepia: 'Sepia preset sentinel',
          light: 'Light preset sentinel',
          darkGreen: 'Dark green preset sentinel',
          amoled: 'Amoled preset sentinel',
        },
      },
    };

    await act(async () => {
      root.render(<ViewSettings />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const lightPresetButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Light preset sentinel'),
    );
    expect(lightPresetButton).toBeTruthy();

    await act(async () => {
      lightPresetButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      vi.advanceTimersByTime(350);
      await Promise.resolve();
    });

    const saveCalls = invokeMock.mock.calls.filter(([command]) => command === 'set_setting');
    expect(saveCalls.length).toBeGreaterThan(0);
  });
});
