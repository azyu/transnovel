import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelModal } from './ModelModal';
import type { ProviderConfig } from './types';
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

describe('ModelModal', () => {
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

  it('guides manual model input for custom providers', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'provider-custom',
        type: 'custom',
        name: 'OpenAI-compatible',
        apiKey: 'sk-test',
        baseUrl: 'https://example.com/v1',
      },
    ];

    await act(async () => {
      root.render(
        <ModelModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          providers={providers}
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const refreshButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('↻'),
    );

    expect(container.textContent).toContain('모델 ID를 직접 입력');
    expect(refreshButton).toHaveProperty('disabled', true);
  });

  it('disables edit and save controls when the managed lock is active', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'provider-openrouter',
        type: 'openrouter',
        name: 'OpenRouter',
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api',
      },
    ];

    await act(async () => {
      root.render(
        <ModelModal
          isOpen
          onClose={() => {}}
          onSave={() => {}}
          disabled
          editingModel={{
            id: 'model-1',
            name: 'Model A',
            providerId: 'provider-openrouter',
            modelId: 'openai/gpt-4o',
          }}
          providers={providers}
        />,
      );
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('저장'),
    );
    expect(saveButton).toBeTruthy();
    expect(saveButton).toBeDisabled();

    const refreshButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('↻'),
    );
    expect(refreshButton).toBeTruthy();
    expect(refreshButton).toBeDisabled();

    const inputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    expect(inputs[0]).toBeDisabled();
    expect(inputs[1]).toBeDisabled();
  });
});
