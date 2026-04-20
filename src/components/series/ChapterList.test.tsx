import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChapterList } from './ChapterList';
import { messages } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';

describe('ChapterList', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalSeriesMessages: unknown;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    originalSeriesMessages = messages.series;
    useUIStore.setState({ theme: 'dark', language: 'ko' });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    (messages as { series: unknown }).series = originalSeriesMessages;
    vi.clearAllMocks();
  });

  it('renders chapter list labels from i18n messages', async () => {
    const originalSeries = originalSeriesMessages as typeof messages.series;
    (messages as { series: unknown }).series = {
      ...originalSeries,
      chapterList: {
        startLabel: 'Start chapter sentinel',
        endLabel: 'End chapter sentinel',
        totalChapters: (count: number) => `Total chapters sentinel ${count}`,
        startBatch: 'Start batch sentinel',
        columns: {
          number: 'Number sentinel',
          title: 'Title sentinel',
        },
        openChapterAriaLabel: (chapterNumber: number, title: string) =>
          `Open chapter sentinel ${chapterNumber} ${title}`,
        empty: 'Empty chapter sentinel',
      },
    };

    await act(async () => {
      root.render(
        <ChapterList
          chapters={[
            { number: 3, title: '세 번째 화', url: 'https://example.com/3', status: 'pending' },
          ]}
          onStartTranslation={() => {}}
          onChapterDoubleClick={() => {}}
          isLoading={false}
        />,
      );
    });

    expect(container.textContent).toContain('Start chapter sentinel');
    expect(container.textContent).toContain('End chapter sentinel');
    expect(container.textContent).toContain('Total chapters sentinel 1');
    expect(container.textContent).toContain('Start batch sentinel');
    expect(container.textContent).toContain('Number sentinel');
    expect(container.textContent).toContain('Title sentinel');
    expect(container.querySelector('button[aria-label="Open chapter sentinel 3 세 번째 화"]')).toBeTruthy();
  });
});
