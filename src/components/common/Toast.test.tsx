import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../stores/uiStore';
import { Toast } from './Toast';

describe('Toast', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({
      theme: 'dark',
      language: 'en',
      toast: { message: 'Saved', type: 'success' },
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    useUIStore.setState({ toast: null });
  });

  it.each([
    { language: 'ko' as const, expectedLabel: '알림 닫기', otherLabel: 'Close notification' },
    { language: 'en' as const, expectedLabel: 'Close notification', otherLabel: '알림 닫기' },
  ])('renders the close button in $language', async ({ language, expectedLabel, otherLabel }) => {
    useUIStore.setState({ language });

    await act(async () => {
      root.render(<Toast />);
    });

    expect(document.body.querySelector(`button[aria-label="${expectedLabel}"]`)).toBeTruthy();
    expect(document.body.querySelector(`button[aria-label="${otherLabel}"]`)).toBeFalsy();
  });
});
