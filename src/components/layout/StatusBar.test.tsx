import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../stores/uiStore';
import { StatusBar } from './StatusBar';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async (): Promise<{ key: string; value: string }[]> => []),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

describe('StatusBar', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({ theme: 'dark', language: 'en' });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it.each([
    {
      language: 'ko' as const,
      providerLabel: '제공자:',
      noneLabel: '없음',
      modelLabel: '모델:',
      notConfiguredLabel: '미설정',
      streamingLabel: '스트리밍',
      batchLabel: '일괄',
      otherProviderLabel: 'Provider:',
      otherStreamingLabel: 'Streaming',
      otherBatchLabel: 'Batch',
    },
    {
      language: 'en' as const,
      providerLabel: 'Provider:',
      noneLabel: 'None',
      modelLabel: 'Model:',
      notConfiguredLabel: 'Not configured',
      streamingLabel: 'Streaming',
      batchLabel: 'Batch',
      otherProviderLabel: '제공자:',
      otherStreamingLabel: '스트리밍',
      otherBatchLabel: '일괄',
    },
  ])('renders status and mode labels in $language', async ({
    language,
    providerLabel,
    noneLabel,
    modelLabel,
    notConfiguredLabel,
    streamingLabel,
    batchLabel,
    otherProviderLabel,
    otherStreamingLabel,
    otherBatchLabel,
  }) => {
    let settings = [{ key: 'use_streaming', value: 'true' }];
    invokeMock.mockImplementation(async () => settings);
    useUIStore.setState({ language });

    await act(async () => {
      root.render(<StatusBar />);
    });
    await act(async () => {});

    expect(container.textContent).toContain(providerLabel);
    expect(container.textContent).toContain(noneLabel);
    expect(container.textContent).toContain(modelLabel);
    expect(container.textContent).toContain(notConfiguredLabel);
    expect(container.textContent).toContain(streamingLabel);
    expect(container.textContent).not.toContain(batchLabel);
    expect(container.textContent).not.toContain(otherProviderLabel);
    expect(container.textContent).not.toContain(otherStreamingLabel);

    settings = [{ key: 'use_streaming', value: 'false' }];
    await act(async () => {
      window.dispatchEvent(new Event('settings-changed'));
    });

    expect(container.textContent).toContain(batchLabel);
    expect(container.textContent).not.toContain(streamingLabel);
    expect(container.textContent).not.toContain(otherBatchLabel);
  });
});
