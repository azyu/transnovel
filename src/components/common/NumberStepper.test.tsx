import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../stores/uiStore';
import { NumberStepper } from './NumberStepper';

describe('NumberStepper', () => {
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
    {
      language: 'ko' as const,
      expectedDecrement: '감소',
      expectedIncrement: '증가',
      otherDecrement: 'Decrease',
      otherIncrement: 'Increase',
    },
    {
      language: 'en' as const,
      expectedDecrement: 'Decrease',
      expectedIncrement: 'Increase',
      otherDecrement: '감소',
      otherIncrement: '증가',
    },
  ])('renders step buttons in $language', async ({
    language,
    expectedDecrement,
    expectedIncrement,
    otherDecrement,
    otherIncrement,
  }) => {
    useUIStore.setState({ language });

    await act(async () => {
      root.render(<NumberStepper value={2} min={0} max={3} onChange={vi.fn()} />);
    });

    expect(container.querySelector(`button[aria-label="${expectedDecrement}"]`)).toBeTruthy();
    expect(container.querySelector(`button[aria-label="${expectedIncrement}"]`)).toBeTruthy();
    expect(container.querySelector(`button[aria-label="${otherDecrement}"]`)).toBeFalsy();
    expect(container.querySelector(`button[aria-label="${otherIncrement}"]`)).toBeFalsy();
  });

  it.each([
    {
      language: 'ko' as const,
      label: '글꼴 크기',
      expectedDecrement: '글꼴 크기 감소',
      expectedIncrement: '글꼴 크기 증가',
    },
    {
      language: 'en' as const,
      label: 'Font size',
      expectedDecrement: 'Font size Decrease',
      expectedIncrement: 'Font size Increase',
    },
  ])('includes the visible label in $language step button names', async ({
    language,
    label,
    expectedDecrement,
    expectedIncrement,
  }) => {
    useUIStore.setState({ language });

    await act(async () => {
      root.render(
        <NumberStepper label={label} value={2} min={0} max={3} onChange={vi.fn()} />,
      );
    });

    expect(container.querySelector(`button[aria-label="${expectedDecrement}"]`)).toBeTruthy();
    expect(container.querySelector(`button[aria-label="${expectedIncrement}"]`)).toBeTruthy();
  });
});
