import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { AdvancedSettings } from './AdvancedSettings';
import { getMessages, messages } from '../../i18n';
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

  describe('per-novel cache deletion', () => {
    const askMock = vi.mocked(ask);
    const messageMock = vi.mocked(message);
    const novels = [
      { novel_id: 'n1111', title: 'Target Work', site: 'syosetu', count: 7, total_hits: 2 },
      { novel_id: 'n2222', title: 'Other Work', site: 'nocturne', count: 4, total_hits: 0 },
    ];

    const deferred = <T,>() => {
      let resolve!: (value: T) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };

    let clearImpl: () => Promise<number>;
    let statsAfterClear: typeof novels | null;

    beforeEach(() => {
      clearImpl = async () => 3;
      statsAfterClear = null;
      invokeMock.mockImplementation(async (command: string) => {
        if (command === 'get_cache_stats_detailed') {
          const byNovel = statsAfterClear ?? novels;
          return {
            total_count: byNovel.reduce((sum, n) => sum + n.count, 0),
            total_hits: 2,
            by_novel: byNovel,
          };
        }
        if (command === 'clear_cache_by_novel') {
          return clearImpl();
        }
        return undefined;
      });
    });

    const flush = async () => {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    const renderWithNovels = async () => {
      await act(async () => {
        root.render(<AdvancedSettings />);
      });
      await flush();
    };

    const deleteButtons = () => {
      const deleteLabel = messages.settings.advanced.cache.deleteAction;
      return Array.from(container.querySelectorAll('button')).filter(
        (button) => button.textContent?.trim().endsWith(deleteLabel),
      );
    };

    const clearCalls = () =>
      invokeMock.mock.calls.filter(([command]) => command === 'clear_cache_by_novel');

    const mutatingCalls = () =>
      invokeMock.mock.calls.filter(([command]) => command !== 'get_cache_stats_detailed');

    const advanced = () => messages.settings.advanced;
    const targetLabel = 'Target Work | ncode.syosetu.com | n1111';
    const otherLabel = 'Other Work | novel18.syosetu.com | n2222';

    const click = async (button: HTMLButtonElement) => {
      await act(async () => {
        button.click();
      });
    };

    it('does not delete when the confirmation is cancelled', async () => {
      askMock.mockResolvedValue(false);
      await renderWithNovels();

      await click(deleteButtons()[0]);
      await flush();

      expect(askMock).toHaveBeenCalledTimes(1);
      expect(askMock.mock.calls[0][0]).toBe(advanced().confirmClearNovelCache(targetLabel, 7));
      expect(mutatingCalls()).toHaveLength(0);
      expect(deleteButtons().every((button) => !button.disabled)).toBe(true);
    });

    it('deletes the selected work once and reports the deleted count', async () => {
      askMock.mockResolvedValue(true);
      await renderWithNovels();
      statsAfterClear = [novels[0]];

      await click(deleteButtons()[1]);
      await flush();

      expect(askMock.mock.calls[0][0]).toBe(advanced().confirmClearNovelCache(otherLabel, 4));
      expect(mutatingCalls()).toEqual([
        ['clear_cache_by_novel', { site: 'nocturne', novelId: 'n2222' }],
      ]);
      expect(messageMock).toHaveBeenCalledTimes(1);
      expect(messageMock.mock.calls[0][0]).toBe(advanced().clearNovelCacheSuccess(otherLabel, 3));
      expect(messageMock.mock.calls[0][1]).not.toMatchObject({ kind: 'error' });
      expect(container.textContent).not.toContain('Other Work');
    });

    it('names the target and its cache count when deletion fails', async () => {
      askMock.mockResolvedValue(true);
      clearImpl = async () => {
        throw 'db locked';
      };
      await renderWithNovels();
      statsAfterClear = [novels[1]];

      await click(deleteButtons()[0]);
      await flush();

      expect(container.textContent).not.toContain('Target Work');
      expect(mutatingCalls()).toEqual([
        ['clear_cache_by_novel', { site: 'syosetu', novelId: 'n1111' }],
      ]);
      expect(messageMock).toHaveBeenCalledTimes(1);
      expect(messageMock.mock.calls[0][0]).toBe(
        advanced().clearNovelCacheFailed(targetLabel, 7, 'db locked'),
      );
      expect(messageMock.mock.calls[0][1]).toMatchObject({ kind: 'error' });
      expect(deleteButtons().every((button) => !button.disabled)).toBe(true);
    });

    it('blocks other deletions while confirming and while the request is pending', async () => {
      const confirmation = deferred<boolean>();
      const request = deferred<number>();
      askMock.mockReturnValue(confirmation.promise);
      clearImpl = () => request.promise;
      await renderWithNovels();

      await click(deleteButtons()[0]);
      expect(deleteButtons()[1].disabled).toBe(true);
      await click(deleteButtons()[1]);
      expect(askMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        confirmation.resolve(true);
      });
      await flush();
      expect(clearCalls()).toHaveLength(1);
      expect(deleteButtons()[0].disabled).toBe(true);
      expect(deleteButtons()[1].disabled).toBe(true);
      await click(deleteButtons()[1]);
      expect(askMock).toHaveBeenCalledTimes(1);
      expect(clearCalls()).toHaveLength(1);

      await act(async () => {
        request.resolve(3);
      });
      await flush();
      expect(deleteButtons().every((button) => !button.disabled)).toBe(true);
    });
  });

  it.each(['ko', 'en'] as const)('puts the target and counts into %s per-novel cache texts', (language) => {
    const advanced = getMessages(language).settings.advanced;
    const target = 'Sample Work | kakuyomu.jp | 1177354055';

    const confirmText = advanced.confirmClearNovelCache(target, 17);
    expect(confirmText).toContain(target);
    expect(confirmText).toContain('17');

    const successText = advanced.clearNovelCacheSuccess(target, 23);
    expect(successText).toContain(target);
    expect(successText).toContain('23');

    const failureText = advanced.clearNovelCacheFailed(target, 29, 'db locked');
    expect(failureText).toContain(target);
    expect(failureText).toContain('29');
    expect(failureText).toContain('db locked');
  });
});
