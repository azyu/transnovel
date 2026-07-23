import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSeriesStore } from '../../stores/seriesStore';
import { useTranslationStore } from '../../stores/translationStore';
import { useUIStore } from '../../stores/uiStore';
import { useUpdateStore } from '../../stores/updateStore';
import { AppUpdateDialog } from './AppUpdateDialog';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage = undefined;
  },
}));

describe('AppUpdateDialog', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({ theme: 'dark', language: 'ko' });
    useTranslationStore.setState({ isTranslating: false });
    useSeriesStore.setState({ batchProgress: null });
    useUpdateStore.setState({
      status: 'available',
      update: {
        currentVersion: '0.1.3',
        version: '0.1.4',
        body: 'Release notes',
      },
      error: null,
      downloadedBytes: 0,
      totalBytes: null,
      isDialogOpen: true,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('offers an update and restart action when the app is idle', async () => {
    await act(async () => {
      root.render(<AppUpdateDialog />);
    });

    const updateButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('업데이트 및 재시작'),
    );
    expect(document.body.textContent).toContain('현재 v0.1.3에서 v0.1.4으로 업데이트할 수 있습니다.');
    expect(document.body.textContent).toContain('Release notes');
    expect(updateButton?.disabled).toBe(false);
  });

  it('blocks installation while a translation is active', async () => {
    useTranslationStore.setState({ isTranslating: true });
    await act(async () => {
      root.render(<AppUpdateDialog />);
    });

    const updateButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('업데이트 및 재시작'),
    );
    expect(document.body.textContent).toContain('번역 작업이 진행 중이거나 일시 정지되어 있습니다.');
    expect(updateButton?.disabled).toBe(true);
  });
});
