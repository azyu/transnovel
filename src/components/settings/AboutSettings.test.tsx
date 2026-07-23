import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { useUIStore } from '../../stores/uiStore';
import { useUpdateStore } from '../../stores/updateStore';
import { AboutSettings } from './AboutSettings';

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  Channel: class {},
}));

describe('AboutSettings', () => {
  const getVersionMock = vi.mocked(getVersion);
  const invokeMock = vi.mocked(invoke);
  let container: HTMLDivElement;
  let root: Root;
  let consoleErrorSpy: MockInstance;

  const renderAbout = async () => {
    await act(async () => {
      root.render(<AboutSettings />);
    });
  };

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({ theme: 'dark', language: 'ko' });
    useUpdateStore.setState({
      status: 'idle',
      update: null,
      error: null,
      downloadedBytes: 0,
      totalBytes: null,
      isDialogOpen: false,
    });
    getVersionMock.mockResolvedValue('0.1.1');
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('shows an available native update', async () => {
    invokeMock.mockResolvedValue({
      currentVersion: '0.1.1',
      version: '0.1.2',
      body: 'Release notes',
    });
    await renderAbout();

    const checkButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('업데이트 확인'),
    );
    await act(async () => {
      checkButton?.click();
    });

    expect(invokeMock).toHaveBeenCalledWith('check_for_update');
    expect(container.textContent).toContain('새 버전 v0.1.2을 사용할 수 있습니다.');
    expect(container.textContent).toContain('업데이트하기');
  });

  it('shows the up-to-date state when the updater returns no release', async () => {
    invokeMock.mockResolvedValue(null);
    await renderAbout();

    const checkButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('업데이트 확인'),
    );
    await act(async () => {
      checkButton?.click();
    });

    expect(container.textContent).toContain('현재 최신 버전을 사용 중입니다.');
  });

  it('shows a native updater check failure without breaking application information', async () => {
    invokeMock.mockRejectedValue(new Error('latest.json 404'));
    await renderAbout();

    const checkButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('업데이트 확인'),
    );
    await act(async () => {
      checkButton?.click();
    });

    expect(container.textContent).toContain('업데이트 확인 실패: latest.json 404');
    expect(container.textContent).toContain('TransNovel');
  });


  it('renders about labels in English when the UI language is English', async () => {
    useUIStore.setState({ theme: 'dark', language: 'en' });
    await renderAbout();

    expect(container.textContent).toContain('About');
    expect(container.textContent).toContain('Application information');
    expect(container.textContent).toContain('Version');
    expect(container.textContent).toContain('Check for updates');
  });
});
