import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterDictionaryModal } from './CharacterDictionaryModal';
import { useUIStore } from '../../stores/uiStore';

const setInputValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

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
      setInputValue(inputs[0] as HTMLInputElement, '周');
      setInputValue(inputs[2] as HTMLInputElement, '아마네');
    });

    const saveButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('저장'),
    );

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('resets draft entries when reopened with the same saved entries', async () => {
    const savedEntries = [
      {
        source_text: '周',
        reading: 'あまね',
        target_name: '아마네',
        note: '주인공',
      },
    ];
    const onSave = vi.fn(async () => {});

    await act(async () => {
      root.render(
        <CharacterDictionaryModal
          isOpen
          title="사용자 정의 고유명사 사전"
          description="설명"
          entries={[...savedEntries]}
          saveLabel="저장"
          onClose={() => {}}
          onSave={onSave}
        />,
      );
    });

    const inputs = Array.from(document.body.querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs[2].value).toBe('아마네');

    await act(async () => {
      setInputValue(inputs[2], '임시 수정');
    });

    await act(async () => {
      const saveButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('저장'),
      );
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenLastCalledWith([
      expect.objectContaining({
        source_text: '周',
        target_name: '임시 수정',
      }),
    ]);

    await act(async () => {
      root.render(
        <CharacterDictionaryModal
          isOpen={false}
          title="사용자 정의 고유명사 사전"
          description="설명"
          entries={[...savedEntries]}
          saveLabel="저장"
          onClose={() => {}}
          onSave={onSave}
        />,
      );
    });

    await act(async () => {
      root.render(
        <CharacterDictionaryModal
          isOpen
          title="사용자 정의 고유명사 사전"
          description="설명"
          entries={[...savedEntries]}
          saveLabel="저장"
          onClose={() => {}}
          onSave={onSave}
        />,
      );
    });

    await act(async () => {
      const saveButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('저장'),
      );
      saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenLastCalledWith([
      expect.objectContaining({
        source_text: '周',
        target_name: '아마네',
      }),
    ]);
  });
});
