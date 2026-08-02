import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NumberStepper } from './NumberStepper';
import { useUIStore } from '../../stores/uiStore';

describe('NumberStepper', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({ theme: 'dark', language: 'ko' });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('includes the visible setting label in decrement and increment names', async () => {
    await act(async () => {
      root.render(
        <NumberStepper label="최대 재시도" value={2} onChange={() => {}} />,
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons[0]).toHaveAttribute('aria-label', '최대 재시도 감소');
    expect(buttons[1]).toHaveAttribute('aria-label', '최대 재시도 증가');
  });

  it('uses localized generic names when no visible setting label exists', async () => {
    useUIStore.setState({ language: 'en' });

    await act(async () => {
      root.render(<NumberStepper value={2} onChange={() => {}} />);
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons[0]).toHaveAttribute('aria-label', 'Decrease');
    expect(buttons[1]).toHaveAttribute('aria-label', 'Increase');
  });
});
