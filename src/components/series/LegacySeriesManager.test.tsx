import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LegacySeriesManager } from './LegacySeriesManager';
import { messages } from '../../i18n';
import { useSeriesStore } from '../../stores/seriesStore';
import { useTranslationStore } from '../../stores/translationStore';
import { useUIStore } from '../../stores/uiStore';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  message: vi.fn(async () => {}),
}));

vi.mock('../translation/UrlInput', () => ({
  UrlInput: () => <div data-testid="url-input" />,
}));

vi.mock('./ChapterList', () => ({
  ChapterList: () => <div data-testid="chapter-list" />,
}));

vi.mock('./BatchTranslationModal', () => ({
  BatchTranslationModal: () => null,
}));

vi.mock('../common/Modal', () => ({
  Modal: ({ title, children, footer, isOpen }: { title?: ReactNode; children: ReactNode; footer?: ReactNode; isOpen: boolean }) =>
    isOpen ? (
      <div>
        <div>{title}</div>
        <div>{children}</div>
        <div>{footer}</div>
      </div>
    ) : null,
}));

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    startBatchTranslation: vi.fn(async () => {}),
    stopBatchTranslation: vi.fn(async () => {}),
    pauseBatchTranslation: vi.fn(async () => {}),
    resumeBatchTranslation: vi.fn(async () => {}),
    exportNovel: vi.fn(async () => {}),
    parseAndTranslate: vi.fn(async () => {}),
  }),
}));

describe('LegacySeriesManager', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalSeriesMessages: unknown;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    originalSeriesMessages = messages.series;

    useUIStore.setState({
      theme: 'dark',
      setTab: vi.fn(),
    } as never);
    useSeriesStore.setState({
      chapterList: [{ number: 1, title: '1화', url: 'https://example.com/1', status: 'pending' }],
      batchProgress: null,
    } as never);
    useTranslationStore.setState({
      isTranslating: false,
      currentUrl: 'https://example.com/1',
      setUrl: vi.fn(),
      getChapterContent: vi.fn(() => null),
    } as never);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    (messages as { series: unknown }).series = originalSeriesMessages;
    vi.clearAllMocks();
  });

  it('renders legacy export labels from i18n messages', async () => {
    const originalSeries = originalSeriesMessages as typeof messages.series;
    (messages as { series: unknown }).series = {
      ...originalSeries,
      legacy: {
        noNovelLoaded: 'No novel sentinel',
        alertTitle: 'Alert sentinel',
        exportCompleted: 'Export completed sentinel',
        exportFailed: (detail: string) => `Export failed sentinel ${detail}`,
        exportButton: 'Export button sentinel',
        modalTitle: 'Export modal sentinel',
        cancel: 'Cancel export sentinel',
        export: 'Export action sentinel',
        formatLabel: 'Format label sentinel',
        formats: {
          txtSingle: 'TXT single sentinel',
          txtChapters: 'TXT chapters sentinel',
          epub: 'EPUB sentinel',
        },
        downloadsNote: 'Downloads note sentinel',
      },
    };

    await act(async () => {
      root.render(<LegacySeriesManager />);
    });

    const exportButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Export button sentinel'),
    );
    expect(exportButton).toBeTruthy();

    await act(async () => {
      exportButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Export modal sentinel');
    expect(container.textContent).toContain('Cancel export sentinel');
    expect(container.textContent).toContain('Export action sentinel');
    expect(container.textContent).toContain('Format label sentinel');
    expect(container.textContent).toContain('TXT single sentinel');
    expect(container.textContent).toContain('TXT chapters sentinel');
    expect(container.textContent).toContain('EPUB sentinel');
    expect(container.textContent).toContain('Downloads note sentinel');
  });
});
