import { useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getMessages, isUILanguage, type UILanguage } from '../i18n';
import { useUIStore } from '../stores/uiStore';

type SettingEntry = { key: string; value: string };

export const loadUILanguageFlow = async (
  invokeFn: typeof invoke,
  setLanguage: (language: UILanguage) => void,
) => {
  const settings = await invokeFn<SettingEntry[]>('get_settings');
  if (!Array.isArray(settings)) {
    return;
  }
  const savedLanguage = settings.find((entry) => entry.key === 'ui_language')?.value;

  if (savedLanguage && isUILanguage(savedLanguage)) {
    setLanguage(savedLanguage);
  }
};

export const saveUILanguageFlow = async (
  invokeFn: typeof invoke,
  language: UILanguage,
) =>
  invokeFn('set_setting', {
    key: 'ui_language',
    value: language,
  });

export const useUILanguage = () => {
  const language = useUIStore((state) => state.language);
  const setLanguage = useUIStore((state) => state.setLanguage);

  useEffect(() => {
    void loadUILanguageFlow(invoke, setLanguage).catch(console.error);
  }, [setLanguage]);

  const updateLanguage = useCallback(async (nextLanguage: UILanguage) => {
    setLanguage(nextLanguage);
    try {
      await saveUILanguageFlow(invoke, nextLanguage);
    } catch (error) {
      console.error('Failed to persist UI language:', error);
    }
  }, [setLanguage]);

  return {
    language,
    messages: getMessages(language),
    setLanguage: updateLanguage,
  };
};
