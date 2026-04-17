import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { LLMSettings } from './LLMSettings';
import { useUIStore } from '../../stores/uiStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

let providerModalProps: { isOpen: boolean; disabled?: boolean } | null = null;
let modelModalProps: { isOpen: boolean; disabled?: boolean } | null = null;

vi.mock('./llm/ProviderModal', () => ({
  ProviderModal: (props: { isOpen: boolean; disabled?: boolean }) => {
    providerModalProps = props;
    if (!props.isOpen) return null;
    return <div data-testid="provider-modal" data-disabled={props.disabled ? 'true' : 'false'} />;
  },
}));

vi.mock('./llm/ModelModal', () => ({
  ModelModal: (props: { isOpen: boolean; disabled?: boolean }) => {
    modelModalProps = props;
    if (!props.isOpen) return null;
    return <div data-testid="model-modal" data-disabled={props.disabled ? 'true' : 'false'} />;
  },
}));

describe('LLMSettings', () => {
  const invokeMock = vi.mocked(invoke);
  let container: HTMLDivElement;
  let root: Root;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  const managedSettings = [
    {
      key: 'llm_providers',
      value: JSON.stringify([
        {
          id: 'provider-1',
          type: 'custom',
          name: 'Provider A',
          apiKey: 'sk-test',
          baseUrl: 'https://example.com/v1',
        },
      ]),
    },
    {
      key: 'llm_models',
      value: JSON.stringify([
        {
          id: 'model-1',
          name: 'Model A',
          providerId: 'provider-1',
          modelId: 'gemma-4',
        },
      ]),
    },
    { key: 'active_model_id', value: 'model-1' },
    { key: 'use_streaming', value: 'true' },
    { key: 'llm_config_managed', value: 'true' },
    { key: 'llm_config_path', value: '/Users/test/.config/transnovel/config.yaml' },
  ];

  const unlockedSettings = managedSettings.filter((setting) => setting.key !== 'llm_config_managed' && setting.key !== 'llm_config_path');

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    providerModalProps = null;
    modelModalProps = null;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useUIStore.setState({ theme: 'dark' });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('keeps the surface locked during load and does not flush a stale autosave after managed mode engages', async () => {
    vi.useFakeTimers();

    let resolveSettings!: (value: typeof managedSettings) => void;
    const settingsPromise = new Promise<typeof managedSettings>((resolve) => {
      resolveSettings = resolve;
    });

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_settings') {
        return settingsPromise;
      }

      return undefined;
    });

    await act(async () => {
      root.render(<LLMSettings />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const addProviderButtonBeforeLoad = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('+ 추가'),
    ) as HTMLButtonElement | undefined;
    expect(addProviderButtonBeforeLoad).toBeTruthy();
    expect(addProviderButtonBeforeLoad).toBeDisabled();

    const streamingToggleBeforeLoad = container.querySelector('button[role="switch"]') as HTMLButtonElement | null;
    expect(streamingToggleBeforeLoad).toBeTruthy();
    expect(streamingToggleBeforeLoad).toBeDisabled();

    await act(async () => {
      resolveSettings(managedSettings);
      await settingsPromise;
      await Promise.resolve();
    });

    const addProviderButtonAfterLoad = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('+ 추가'),
    ) as HTMLButtonElement | undefined;
    expect(addProviderButtonAfterLoad).toBeTruthy();
    expect(addProviderButtonAfterLoad).toBeDisabled();

    const setSettingCallsBeforeUnmount = invokeMock.mock.calls.filter(([command]) => command === 'set_setting');
    expect(setSettingCallsBeforeUnmount).toHaveLength(0);

    await act(async () => {
      root.unmount();
    });

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    const setSettingCallsAfterUnmount = invokeMock.mock.calls.filter(([command]) => command === 'set_setting');
    expect(setSettingCallsAfterUnmount).toHaveLength(0);
  });

  it('shows a configuration error and keeps the surface locked when get_settings fails', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_settings') {
        throw new Error('config.yaml 파싱 실패 (/Users/test/.config/transnovel/config.yaml)');
      }

      return undefined;
    });

    await act(async () => {
      root.render(<LLMSettings />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('LLM 설정을 불러오지 못했습니다.');
    expect(container.textContent).toContain('config.yaml');

    const providerAddButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('+ 추가'),
    ) as HTMLButtonElement | undefined;
    expect(providerAddButton).toBeTruthy();
    expect(providerAddButton).toBeDisabled();

    const modelAddButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button !== providerAddButton && button.textContent?.includes('+ 추가'),
    ) as HTMLButtonElement | undefined;
    expect(modelAddButton).toBeTruthy();
    expect(modelAddButton).toBeDisabled();

    const streamingToggle = container.querySelector('button[role="switch"]') as HTMLButtonElement | null;
    expect(streamingToggle).toBeTruthy();
    expect(streamingToggle).toBeDisabled();

    expect(container.querySelector('button[aria-label$="수정"]')).toBeNull();
    expect(container.querySelector('button[aria-label$="삭제"]')).toBeNull();
  });

  it('shows a generic load error when get_settings fails for a non-config reason', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_settings') {
        throw new Error('database connection failed');
      }

      return undefined;
    });

    await act(async () => {
      root.render(<LLMSettings />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('LLM 설정을 불러오지 못했습니다.');
    expect(container.textContent).toContain('database connection failed');
    expect(container.textContent).not.toContain('config.yaml');
  });

  it('locks the full LLM settings surface when config.yaml manages the settings', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_settings') {
        return managedSettings;
      }

      return undefined;
    });

    await act(async () => {
      root.render(<LLMSettings />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('/Users/test/.config/transnovel/config.yaml');
    expect(container.textContent).toContain('config.yaml');

    const providerAddButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('+ 추가'),
    );
    expect(providerAddButton).toBeTruthy();
    expect(providerAddButton).toBeDisabled();

    const providerEditButton = container.querySelector('button[aria-label="Provider A 수정"]') as HTMLButtonElement | null;
    expect(providerEditButton).toBeTruthy();
    expect(providerEditButton).toBeDisabled();

    const providerDeleteButton = container.querySelector('button[aria-label="Provider A 삭제"]') as HTMLButtonElement | null;
    expect(providerDeleteButton).toBeTruthy();
    expect(providerDeleteButton).toBeDisabled();

    const modelSelectButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Model A'),
    ) as HTMLButtonElement | undefined;
    expect(modelSelectButton).toBeTruthy();
    expect(modelSelectButton).toBeDisabled();

    const modelEditButton = container.querySelector('button[aria-label="Model A 수정"]') as HTMLButtonElement | null;
    expect(modelEditButton).toBeTruthy();
    expect(modelEditButton).toBeDisabled();

    const modelDeleteButton = container.querySelector('button[aria-label="Model A 삭제"]') as HTMLButtonElement | null;
    expect(modelDeleteButton).toBeTruthy();
    expect(modelDeleteButton).toBeDisabled();

    const streamingToggle = container.querySelector('button[role="switch"]') as HTMLButtonElement | null;
    expect(streamingToggle).toBeTruthy();
    expect(streamingToggle).toBeDisabled();
  });

  it('keeps the settings surface editable when config.yaml is not managing it', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_settings') {
        return unlockedSettings;
      }

      return undefined;
    });

    await act(async () => {
      root.render(<LLMSettings />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('config.yaml이 이 LLM 설정을 관리하고 있습니다.');

    const providerAddButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('+ 추가'),
    );
    expect(providerAddButton).toBeTruthy();
    expect(providerAddButton).not.toBeDisabled();

    const streamingToggle = container.querySelector('button[role="switch"]') as HTMLButtonElement | null;
    expect(streamingToggle).toBeTruthy();
    expect(streamingToggle).not.toBeDisabled();
  });

  it('propagates the managed lock into the modal surfaces after load', async () => {
    let resolveSettings!: (value: typeof managedSettings) => void;
    const settingsPromise = new Promise<typeof managedSettings>((resolve) => {
      resolveSettings = resolve;
    });

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_settings') {
        return settingsPromise;
      }

      return undefined;
    });

    await act(async () => {
      root.render(<LLMSettings />);
    });

    await act(async () => {
      resolveSettings(managedSettings);
      await settingsPromise;
      await Promise.resolve();
    });

    expect(providerModalProps).toMatchObject({ isOpen: false, disabled: true });
    expect(modelModalProps).toMatchObject({ isOpen: false, disabled: true });
  });
});
