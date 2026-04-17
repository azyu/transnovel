import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderList } from './ProviderList';
import type { ProviderConfig } from './types';
import { useUIStore } from '../../../stores/uiStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe('ProviderList', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({ theme: 'dark', viewConfigVersion: 0 });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it('shows an oauth configuration error badge when status lookup fails', async () => {
    invokeMock.mockRejectedValueOnce(new Error('config.yaml 파싱 실패'));

    const providers: ProviderConfig[] = [
      {
        id: 'provider-oauth',
        type: 'openai-oauth',
        name: 'ChatGPT',
        apiKey: 'oauth-token',
        baseUrl: '',
      },
    ];

    await act(async () => {
      root.render(
        <ProviderList
          providers={providers}
          onEdit={() => {}}
          onDelete={() => {}}
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('설정 오류');
  });
});
