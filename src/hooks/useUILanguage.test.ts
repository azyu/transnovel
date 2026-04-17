import { describe, expect, it, vi } from 'vitest';
import { loadUILanguageFlow, saveUILanguageFlow } from './useUILanguage';

describe('loadUILanguageFlow', () => {
  it('loads a persisted English UI language from settings', async () => {
    const invokeMock = vi.fn(async () => [
      { key: 'ui_language', value: 'en' },
    ]);
    const setLanguage = vi.fn();

    await loadUILanguageFlow(invokeMock as never, setLanguage);

    expect(invokeMock).toHaveBeenCalledWith('get_settings');
    expect(setLanguage).toHaveBeenCalledWith('en');
  });

  it('ignores unsupported language values and keeps the current language', async () => {
    const invokeMock = vi.fn(async () => [
      { key: 'ui_language', value: 'jp' },
    ]);
    const setLanguage = vi.fn();

    await loadUILanguageFlow(invokeMock as never, setLanguage);

    expect(setLanguage).not.toHaveBeenCalled();
  });
});

describe('saveUILanguageFlow', () => {
  it('persists the selected UI language into settings', async () => {
    const invokeMock = vi.fn(async () => null);

    await saveUILanguageFlow(invokeMock as never, 'en');

    expect(invokeMock).toHaveBeenCalledWith('set_setting', {
      key: 'ui_language',
      value: 'en',
    });
  });
});
