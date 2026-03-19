import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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
});
