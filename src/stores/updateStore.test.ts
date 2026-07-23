import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useSeriesStore } from './seriesStore';
import { useTranslationStore } from './translationStore';
import { useUpdateStore } from './updateStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage = undefined;
  },
}));

describe('useUpdateStore', () => {
  const invokeMock = vi.mocked(invoke);

  beforeEach(() => {
    invokeMock.mockReset();
    useTranslationStore.setState({ isTranslating: false });
    useSeriesStore.setState({ batchProgress: null });
    useUpdateStore.setState({
      status: 'idle',
      update: null,
      error: null,
      downloadedBytes: 0,
      totalBytes: null,
      isDialogOpen: false,
    });
  });

  it('opens the update dialog when the native updater finds a release', async () => {
    invokeMock.mockResolvedValue({
      currentVersion: '0.1.3',
      version: '0.1.4',
      body: 'Release notes',
    });

    await useUpdateStore.getState().checkForUpdate();

    expect(invokeMock).toHaveBeenCalledWith('check_for_update');
    expect(useUpdateStore.getState()).toMatchObject({
      status: 'available',
      update: {
        currentVersion: '0.1.3',
        version: '0.1.4',
        body: 'Release notes',
      },
      isDialogOpen: true,
    });
  });

  it('records that the installed app is current when no update exists', async () => {
    invokeMock.mockResolvedValue(null);

    await useUpdateStore.getState().checkForUpdate();

    expect(useUpdateStore.getState()).toMatchObject({
      status: 'up-to-date',
      update: null,
      isDialogOpen: false,
    });
  });

  it('installs only the version that was presented to the user', async () => {
    invokeMock.mockResolvedValue(undefined);
    useUpdateStore.setState({
      status: 'available',
      update: {
        currentVersion: '0.1.3',
        version: '0.1.4',
        body: null,
      },
      isDialogOpen: true,
    });

    await useUpdateStore.getState().installUpdate();

    expect(invokeMock).toHaveBeenCalledWith('install_update', {
      expectedVersion: '0.1.4',
      onEvent: expect.any(Object),
    });
    expect(useUpdateStore.getState().status).toBe('installing');
  });

  it('does not start installing while translation work is active', async () => {
    useUpdateStore.setState({
      status: 'available',
      update: {
        currentVersion: '0.1.3',
        version: '0.1.4',
        body: null,
      },
      isDialogOpen: true,
    });
    useTranslationStore.setState({ isTranslating: true });

    await useUpdateStore.getState().installUpdate();

    expect(invokeMock).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().status).toBe('available');
  });
});
