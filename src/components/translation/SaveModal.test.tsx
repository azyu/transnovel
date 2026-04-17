import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveModal } from './SaveModal';
import { messages } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';

describe('SaveModal', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalSaveModalMessages: unknown;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({ theme: 'dark', language: 'ko' });
    originalSaveModalMessages = (messages.translation as { saveModal?: unknown }).saveModal;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    (messages.translation as { saveModal?: unknown }).saveModal = originalSaveModalMessages;
    vi.clearAllMocks();
  });

  it('renders save modal labels from i18n messages', async () => {
    (messages.translation as { saveModal?: unknown }).saveModal = {
      title: 'Save modal title sentinel',
      cancel: 'Cancel sentinel',
      save: 'Save sentinel',
      formatLabel: 'Format label sentinel',
      includeOriginal: {
        label: 'Include original sentinel',
        description: 'Include original description sentinel',
      },
      formats: {
        txt: {
          label: 'TXT sentinel',
          description: 'TXT description sentinel',
        },
        html: {
          label: 'HTML sentinel',
          description: 'HTML description sentinel',
        },
      },
    };

    await act(async () => {
      root.render(
        <SaveModal
          isOpen
          onClose={() => {}}
          onSave={vi.fn(async () => {})}
        />,
      );
    });

    expect(document.body.textContent).toContain('Save modal title sentinel');
    expect(document.body.textContent).toContain('Cancel sentinel');
    expect(document.body.textContent).toContain('Save sentinel');
    expect(document.body.textContent).toContain('Format label sentinel');
    expect(document.body.textContent).toContain('Include original sentinel');
    expect(document.body.textContent).toContain('TXT sentinel');
    expect(document.body.textContent).toContain('HTML sentinel');
  });
});
