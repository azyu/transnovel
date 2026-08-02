import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSeriesStore } from '../stores/seriesStore';
import { useTranslationStore } from '../stores/translationStore';
import { useUIStore } from '../stores/uiStore';
import type { TranslationProgress } from '../types';
import { useTauriEvents } from './useTauriEvents';

const eventMocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: (event: { payload: unknown }) => void) => {
    eventMocks.listeners.set(name, handler);
    return vi.fn();
  }),
}));

const activeProgress: TranslationProgress = {
  current_chapter: 2,
  total_chapters: 3,
  chapter_title: '제2화',
  status: 'translating',
};

const EventHarness = () => {
  useTauriEvents();
  return null;
};

describe('useTauriEvents batch outcomes', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    eventMocks.listeners.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useTranslationStore.setState({ isTranslating: true });
    useSeriesStore.setState({ batchProgress: activeProgress });
    useUIStore.setState({ language: 'ko' });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it.each([
    {
      payload: { novel_id: 'n123', success: true, failed_count: 0, stopped: false },
      status: 'completed',
      message: undefined,
    },
    {
      payload: { novel_id: 'n123', success: false, failed_count: 1, stopped: false },
      status: 'error',
      message: '1개 챕터 번역에 실패했습니다.',
    },
    {
      payload: { novel_id: 'n123', success: false, failed_count: 0, stopped: true },
      status: 'stopped',
      message: '번역이 중지되었습니다.',
    },
  ])('records the $status terminal state', async ({ payload, status, message }) => {
    await act(async () => {
      root.render(<EventHarness />);
    });
    await vi.waitFor(() => expect(eventMocks.listeners.has('batch-translation-complete')).toBe(true));

    act(() => {
      eventMocks.listeners.get('batch-translation-complete')?.({ payload });
    });

    expect(useTranslationStore.getState().isTranslating).toBe(false);
    expect(useSeriesStore.getState().batchProgress?.status).toBe(status);
    expect(useSeriesStore.getState().batchProgress?.error_message).toBe(message);
  });

  it('preserves backend batch error detail for the header announcement', async () => {
    await act(async () => {
      root.render(<EventHarness />);
      await Promise.resolve();
    });

    act(() => {
      eventMocks.listeners.get('translation-error')?.({
        payload: {
          current_chapter: 2,
          total_chapters: 4,
          chapter_title: '제2화',
          status: 'error',
          error_message: 'provider quota exhausted',
        },
      });
    });

    expect(useSeriesStore.getState().batchProgress).toMatchObject({
      status: 'error',
      error_message: 'provider quota exhausted',
    });
  });

  it('localizes synthesized batch failure detail for the active UI language', async () => {
    useUIStore.setState({ language: 'en' });

    await act(async () => {
      root.render(<EventHarness />);
    });
    await vi.waitFor(() => expect(eventMocks.listeners.has('batch-translation-complete')).toBe(true));

    act(() => {
      eventMocks.listeners.get('batch-translation-complete')?.({
        payload: { novel_id: 'n123', success: false, failed_count: 2, stopped: false },
      });
    });

    expect(useSeriesStore.getState().batchProgress).toMatchObject({
      status: 'error',
      error_message: '2 chapters failed to translate.',
    });
  });
});
