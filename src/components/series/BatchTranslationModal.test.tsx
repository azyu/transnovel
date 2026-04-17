import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatchTranslationModal } from './BatchTranslationModal';
import { messages } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';

describe('BatchTranslationModal', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalSeriesMessages: unknown;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    originalSeriesMessages = messages.series;
    useUIStore.setState({ theme: 'dark' });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    (messages as { series: unknown }).series = originalSeriesMessages;
    vi.clearAllMocks();
  });

  it('renders batch translation labels from i18n messages', async () => {
    const originalSeries = originalSeriesMessages as typeof messages.series;
    (messages as { series: unknown }).series = {
      ...originalSeries,
      batchTranslation: {
        dialogLabel: 'Batch dialog sentinel',
        status: {
          paused: 'Paused sentinel',
          error: 'Error sentinel',
          completed: 'Completed sentinel',
          translating: 'Translating sentinel',
        },
        title: (statusText: string) => `Batch title sentinel ${statusText}`,
        progressLabel: 'Progress label sentinel',
        chapterProgress: (current: number, total: number) => `Chapter progress sentinel ${current}/${total}`,
        percentComplete: (percentage: number) => `Percent sentinel ${percentage}`,
        resume: 'Resume sentinel',
        pause: 'Pause sentinel',
        stop: 'Stop sentinel',
      },
    };

    await act(async () => {
      root.render(
        <BatchTranslationModal
          progress={{
            status: 'translating',
            current_chapter: 2,
            total_chapters: 4,
            chapter_title: '현재 화',
            error_message: undefined,
          }}
          isPaused={false}
          onPause={() => {}}
          onResume={() => {}}
          onStop={() => {}}
        />,
      );
    });

    expect(document.body.textContent).toContain('Batch title sentinel Translating sentinel');
    expect(document.body.textContent).toContain('Progress label sentinel');
    expect(document.body.textContent).toContain('Chapter progress sentinel 2/4');
    expect(document.body.textContent).toContain('Percent sentinel 50');
    expect(document.body.textContent).toContain('Pause sentinel');
    expect(document.body.textContent).toContain('Stop sentinel');
    expect(document.body.querySelector('[aria-label="Batch dialog sentinel"]')).toBeTruthy();
  });
});
