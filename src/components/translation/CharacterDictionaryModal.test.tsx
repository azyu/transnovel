import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterDictionaryModal } from './CharacterDictionaryModal';
import { useUIStore } from '../../stores/uiStore';

describe('CharacterDictionaryModal', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useUIStore.setState({ theme: 'dark' });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it('creates an editable empty row when no entries are provided', async () => {
    const onSave = vi.fn(async () => {});

    await act(async () => {
      root.render(
        <CharacterDictionaryModal
          isOpen
          title="사용자 정의 고유명사 사전"
          description="설명"
          entries={[]}
          saveLabel="저장"
          onClose={() => {}}
          onSave={onSave}
        />,
      );
    });

    const inputs = Array.from(document.body.querySelectorAll('input'));
    expect(inputs.length).toBeGreaterThanOrEqual(4);

    await act(async () => {
      inputs[0].value = '周';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[2].value = '아마네';
      inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('저장'),
    );

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
