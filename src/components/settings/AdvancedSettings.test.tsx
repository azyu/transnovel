import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { AdvancedSettings } from './AdvancedSettings';
import { messages } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';
import { useDebugStore } from '../../stores/debugStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  ask: vi.fn(),
  message: vi.fn(async () => {}),
}));

describe('AdvancedSettings', () => {
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
    useDebugStore.setState({ debugMode: false });
    originalSettingsMessages = messages.settings;
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_cache_stats_detailed') {
        return {
          total_count: 12,
          total_hits: 34,
          by_novel: [],
        };
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
  });

  it('renders labels from settings i18n messages', async () => {
    const originalSettings = originalSettingsMessages as typeof messages.settings;
    (messages as { settings: unknown }).settings = {
      ...originalSettings,
      advanced: {
        ...originalSettings.advanced,
        title: 'Advanced title sentinel',
        description: 'Advanced description sentinel',
        cache: {
          ...originalSettings.advanced.cache,
          title: 'Cache title sentinel',
          clearAction: 'Clear cache sentinel',
        },
        debugMode: {
          ...originalSettings.advanced.debugMode,
          title: 'Debug mode sentinel',
        },
        dangerZone: {
          ...originalSettings.advanced.dangerZone,
          title: 'Danger zone sentinel',
          resetAction: 'Reset sentinel',
        },
      },
    };

    await act(async () => {
      root.render(<AdvancedSettings />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Advanced title sentinel');
    expect(container.textContent).toContain('Advanced description sentinel');
    expect(container.textContent).toContain('Cache title sentinel');
    expect(container.textContent).toContain('Clear cache sentinel');
    expect(container.textContent).toContain('Debug mode sentinel');
    expect(container.textContent).toContain('Danger zone sentinel');
    expect(container.textContent).toContain('Reset sentinel');
  });
});
