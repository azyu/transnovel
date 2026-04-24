import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParagraphList } from './ParagraphList';
import { messages } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';
import { useTranslationStore } from '../../stores/translationStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => []),
}));

describe('ParagraphList', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalParagraphListMessages: unknown;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    originalParagraphListMessages = (messages.translation as { paragraphList?: unknown }).paragraphList;

    useUIStore.setState({ theme: 'dark', language: 'ko', viewConfigVersion: 0 });
    useTranslationStore.setState({
      paragraphIds: ['p-1'],
      paragraphById: {
        'p-1': {
          id: 'p-1',
          original: '원문',
          translated: '',
        },
      },
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    (messages.translation as { paragraphList?: unknown }).paragraphList = originalParagraphListMessages;
    vi.clearAllMocks();
  });

  it('renders pending text from i18n messages', async () => {
    (messages.translation as { paragraphList?: unknown }).paragraphList = {
      pending: 'Paragraph pending sentinel',
    };

    await act(async () => {
      root.render(<ParagraphList />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Paragraph pending sentinel');
  });

  it('renders spacer paragraphs without pending text', async () => {
    (messages.translation as { paragraphList?: unknown }).paragraphList = {
      pending: 'Paragraph pending sentinel',
    };
    useTranslationStore.setState({
      paragraphIds: ['p-1'],
      paragraphById: {
        'p-1': {
          id: 'p-1',
          original: '',
          translated: '',
          isSpacer: true,
        },
      },
    });

    await act(async () => {
      root.render(<ParagraphList />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('Paragraph pending sentinel');
  });
});
