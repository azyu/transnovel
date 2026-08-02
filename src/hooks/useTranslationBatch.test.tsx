import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTranslation } from './useTranslation';
import { useSeriesStore } from '../stores/seriesStore';
import { useTranslationStore } from '../stores/translationStore';
import { useUIStore } from '../stores/uiStore';
import { useUpdateStore } from '../stores/updateStore';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async () => null),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  message: vi.fn(async () => {}),
}));

interface BatchTranslationActions {
  startBatchTranslation: (
    novelId: string,
    site: string,
    start: number,
    end: number,
    baseUrl: string,
  ) => Promise<void>;
  pauseBatchTranslation: () => Promise<void>;
  resumeBatchTranslation: () => Promise<void>;
}

let translationActions!: BatchTranslationActions;

function TestHarness() {
  const {
    startBatchTranslation,
    pauseBatchTranslation,
    resumeBatchTranslation,
  } = useTranslation();

  useEffect(() => {
    translationActions = {
      startBatchTranslation,
      pauseBatchTranslation,
      resumeBatchTranslation,
    };
  }, [pauseBatchTranslation, resumeBatchTranslation, startBatchTranslation]);

  return null;
}

describe('useTranslation batch lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    invokeMock.mockClear();
    useUIStore.setState({ language: 'ko', toast: null });
    useUpdateStore.setState({ status: 'idle' });
    useTranslationStore.setState({ isTranslating: false });
    useSeriesStore.setState({ batchProgress: null });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('publishes pending, paused, and resumed states around successful commands', async () => {
    await act(async () => {
      root.render(<TestHarness />);
    });

    await act(async () => {
      await translationActions.startBatchTranslation('n1234', 'syosetu', 3, 5, 'https://example.com');
    });

    expect(useSeriesStore.getState().batchProgress).toMatchObject({
      current_chapter: 0,
      total_chapters: 3,
      status: 'pending',
    });

    await act(async () => {
      await translationActions.pauseBatchTranslation();
    });
    expect(useSeriesStore.getState().batchProgress?.status).toBe('paused');

    await act(async () => {
      await translationActions.resumeBatchTranslation();
    });
    expect(useSeriesStore.getState().batchProgress?.status).toBe('translating');
  });
});
