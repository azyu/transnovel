import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../stores/uiStore';
import { Modal } from './Modal';

describe('Modal', () => {
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
  });

  it.each([
    { language: 'ko' as const, expectedLabel: '닫기', otherLabel: 'Close' },
    { language: 'en' as const, expectedLabel: 'Close', otherLabel: '닫기' },
  ])('renders the close button in $language', async ({ language, expectedLabel, otherLabel }) => {
    useUIStore.setState({ language });

    await act(async () => {
      root.render(
        <Modal isOpen onClose={() => {}} title="Example">
          Content
        </Modal>,
      );
    });

    expect(document.body.querySelector(`button[aria-label="${expectedLabel}"]`)).toBeTruthy();
    expect(document.body.querySelector(`button[aria-label="${otherLabel}"]`)).toBeFalsy();
  });
});
