import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Button } from './Button';
import { useUIStore } from '../../stores/uiStore';

describe('Button', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({ language: 'ko' });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('exposes one localized loading announcement and hides its decorative spinner', async () => {
    await act(async () => {
      root.render(<Button isLoading>저장</Button>);
    });

    const button = container.querySelector('button');
    const spinner = container.querySelector('svg');
    const loadingLabel = container.querySelector('.sr-only');

    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(loadingLabel?.textContent).toBe('불러오는 중');
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
    expect(button?.textContent).toContain('저장');
  });
});
