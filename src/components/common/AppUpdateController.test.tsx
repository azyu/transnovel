import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useUpdateStore } from '../../stores/updateStore';
import { AppUpdateController } from './AppUpdateController';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage = undefined;
  },
}));

vi.mock('./AppUpdateDialog', () => ({
  AppUpdateDialog: () => null,
}));

describe('AppUpdateController', () => {
  const invokeMock = vi.mocked(invoke);
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    invokeMock.mockResolvedValue(null);
    useUpdateStore.setState({
      status: 'idle',
      update: null,
      error: null,
      downloadedBytes: 0,
      totalBytes: null,
      isDialogOpen: false,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it('checks for updates when the application starts', async () => {
    await act(async () => {
      root.render(<AppUpdateController />);
    });

    expect(invokeMock).toHaveBeenCalledWith('check_for_update');
  });
});
