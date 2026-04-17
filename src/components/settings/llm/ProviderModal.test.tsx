import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderModal } from './ProviderModal';
import { useUIStore } from '../../../stores/uiStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('../../common/Modal', () => ({
  Modal: ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => (
    <div>
      <div>{children}</div>
      <div>{footer}</div>
    </div>
  ),
}));

const invokeMock = vi.mocked(invoke);

describe('ProviderModal', () => {
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

  it('shows an oauth configuration error when status lookup fails', async () => {
    invokeMock.mockRejectedValueOnce(new Error('config.yaml 파싱 실패'));

    await act(async () => {
      root.render(
        <ProviderModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          editingProvider={{
            id: 'provider-oauth',
            type: 'openai-oauth',
            name: 'ChatGPT',
            apiKey: 'oauth-token',
            baseUrl: '',
          }}
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('설정 오류');
    expect(container.textContent).toContain('config.yaml 파싱 실패');
  });

  it('requires both api key and base url for custom providers', async () => {
    await act(async () => {
      root.render(
        <ProviderModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          editingProvider={{
            id: 'provider-custom',
            type: 'custom',
            name: 'OpenAI-compatible',
            apiKey: '',
            baseUrl: 'https://example.com/v1',
          }}
        />,
      );
    });

    let saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('저장'),
    );

    expect(saveButton).toBeTruthy();
    expect(saveButton).toHaveProperty('disabled', true);

    await act(async () => {
      root.render(
        <ProviderModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          editingProvider={{
            id: 'provider-custom',
            type: 'custom',
            name: 'OpenAI-compatible',
            apiKey: 'sk-test',
            baseUrl: 'https://example.com/v1',
          }}
        />,
      );
    });

    saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('저장'),
    );
    expect(saveButton).toHaveProperty('disabled', false);
  });

  it('disables editing and save controls when the managed lock is active', async () => {
    await act(async () => {
      root.render(
        <ProviderModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          disabled
          editingProvider={{
            id: 'provider-custom',
            type: 'custom',
            name: 'OpenAI-compatible',
            apiKey: 'sk-test',
            baseUrl: 'https://example.com/v1',
          }}
        />,
      );
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('저장'),
    );
    expect(saveButton).toBeTruthy();
    expect(saveButton).toBeDisabled();

    const inputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThanOrEqual(3);
    expect(inputs[0]).toBeDisabled();
    expect(inputs[1]).toBeDisabled();
    expect(inputs[2]).toBeDisabled();
  });
});
