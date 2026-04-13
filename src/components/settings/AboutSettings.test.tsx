import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { AboutSettings } from './AboutSettings';
import { useUIStore } from '../../stores/uiStore';

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('AboutSettings', () => {
  const getVersionMock = vi.mocked(getVersion);
  const invokeMock = vi.mocked(invoke);
  let container: HTMLDivElement;
  let root: Root;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useUIStore.setState({ theme: 'dark' });
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

  it('shows an available update when the latest release is newer', async () => {
    invokeMock.mockResolvedValue({
      version: '0.1.2',
      tagName: 'v0.1.2',
      name: 'v0.1.2',
      htmlUrl: 'https://github.com/azyu/transnovel/releases/tag/v0.1.2',
    });

    await act(async () => {
      root.render(<AboutSettings />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const checkButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('업데이트 확인'),
    );
    expect(checkButton).toBeTruthy();

    await act(async () => {
      checkButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(invokeMock).toHaveBeenCalledWith('fetch_latest_release_info');
    expect(container.textContent).toContain('새 버전 v0.1.2을 사용할 수 있습니다.');
    expect(container.textContent).toContain('릴리즈 열기');
  });

  it('shows up to date state when the latest release matches the installed version', async () => {
    invokeMock.mockResolvedValue({
      version: '0.1.1',
      tagName: 'v0.1.1',
      name: 'v0.1.1',
      htmlUrl: 'https://github.com/azyu/transnovel/releases/tag/v0.1.1',
    });

    await act(async () => {
      root.render(<AboutSettings />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const checkButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('업데이트 확인'),
    );

    await act(async () => {
      checkButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('현재 최신 버전을 사용 중입니다.');
  });

  it('opens the release page when the release link is clicked', async () => {
    invokeMock
      .mockResolvedValueOnce({
        version: '0.1.2',
        tagName: 'v0.1.2',
        name: 'v0.1.2',
        htmlUrl: 'https://github.com/azyu/transnovel/releases/tag/v0.1.2',
      })
      .mockResolvedValueOnce(undefined);

    await act(async () => {
      root.render(<AboutSettings />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const checkButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('업데이트 확인'),
    );

    await act(async () => {
      checkButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const releaseButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('릴리즈 열기'),
    );
    expect(releaseButton).toBeTruthy();

    await act(async () => {
      releaseButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(invokeMock).toHaveBeenLastCalledWith('open_url', {
      url: 'https://github.com/azyu/transnovel/releases/tag/v0.1.2',
    });
  });
});
