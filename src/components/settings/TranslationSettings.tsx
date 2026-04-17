import { useEffect, useId, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { Button } from '../common/Button';
import { Toggle } from '../common/Toggle';
import { messages } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';

export const TranslationSettings: React.FC = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [translationNote, setTranslationNote] = useState('');
  const [substitutions, setSubstitutions] = useState('');
  const [autoProperNounDictionaryEnabled, setAutoProperNounDictionaryEnabled] = useState(true);
  const systemPromptId = useId();
  const translationNoteId = useId();
  const substitutionsId = useId();
  const isDark = useUIStore((state) => state.theme) === 'dark';
  const translationMessages = messages.settings.translation;


  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await invoke<{ key: string; value: string }[]>('get_settings');
        const promptSetting = settings.find(s => s.key === 'system_prompt');
        const noteSetting = settings.find(s => s.key === 'translation_note');
        const subSetting = settings.find(s => s.key === 'substitutions');
        const autoProperNounDictionarySetting = settings.find(
          s => s.key === 'auto_proper_noun_dictionary_enabled',
        );

        if (promptSetting) setSystemPrompt(promptSetting.value);
        if (noteSetting) setTranslationNote(noteSetting.value);
        if (subSetting) setSubstitutions(subSetting.value);
        setAutoProperNounDictionaryEnabled(
          autoProperNounDictionarySetting
            ? autoProperNounDictionarySetting.value !== 'false'
            : true,
        );

        setIsLoaded(true);
      } catch (error) {
        console.error('Failed to load settings:', error);

      }
    };
    loadSettings();
  }, []);

  const pendingSaveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    const save = async () => {
      try {
        await Promise.all([
          invoke('set_setting', { key: 'system_prompt', value: systemPrompt }),
          invoke('set_setting', { key: 'translation_note', value: translationNote }),
          invoke('set_setting', { key: 'substitutions', value: substitutions }),
          invoke('set_setting', {
            key: 'auto_proper_noun_dictionary_enabled',
            value: autoProperNounDictionaryEnabled ? 'true' : 'false',
          }),
        ]);
      } catch (error) {
        console.error('Failed to save settings:', error);
      }
    };
    pendingSaveRef.current = save;
    const t = setTimeout(() => {
      save();
      pendingSaveRef.current = null;
    }, 500);
    return () => clearTimeout(t);
  }, [systemPrompt, translationNote, substitutions, autoProperNounDictionaryEnabled, isLoaded]);
  useEffect(() => {
    return () => { pendingSaveRef.current?.(); };
  }, []);

  const handleResetPrompt = async () => {
    const confirmed = await ask(translationMessages.confirmResetPrompt, {
      title: translationMessages.confirmResetPromptTitle,
      kind: 'warning',
    });
    if (confirmed) {
      setSystemPrompt(translationMessages.defaultSystemPrompt);
    }
  };



  const textareaClass = `w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-y font-mono border ${isDark
      ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500'
      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
    }`;

  return (
    <div className="space-y-6">
      <div className={`border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{translationMessages.title}</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{translationMessages.description}</p>
      </div>

      <div className={`p-6 rounded-xl border space-y-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div>
          <label htmlFor={systemPromptId} className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            {translationMessages.systemPromptLabel}
          </label>
          <div className="space-y-3">
            <textarea
              id={systemPromptId}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={10}
              className={textareaClass}
              placeholder={translationMessages.defaultSystemPrompt}
            />
            <div className="flex justify-between items-center">
              <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <code className="text-blue-400">{`{{note}}`}</code> {translationMessages.systemPromptNoteHint},
                <code className="text-blue-400 ml-2">{`{{slot}}`}</code> {translationMessages.systemPromptSlotHint}
              </p>
              <Button variant="secondary" size="sm" onClick={handleResetPrompt}>
                {translationMessages.resetPrompt}
              </Button>
            </div>
          </div>
        </div>

        <div className={`border-t pt-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="space-y-2">
            <Toggle
              label={translationMessages.autoProperNounToggleLabel}
              checked={autoProperNounDictionaryEnabled}
              onChange={setAutoProperNounDictionaryEnabled}
            />
            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {translationMessages.autoProperNounToggleDescription}
            </p>
          </div>
        </div>

        <div className={`border-t pt-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <label htmlFor={translationNoteId} className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{translationMessages.translationNoteLabel}</label>
          <textarea
            id={translationNoteId}
            value={translationNote}
            onChange={(e) => setTranslationNote(e.target.value)}
            rows={4}
            className={textareaClass}
            placeholder={translationMessages.translationNotePlaceholder}
          />
          <p className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {translationMessages.translationNoteDescription}
          </p>
        </div>

        <div className={`border-t pt-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <label htmlFor={substitutionsId} className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{translationMessages.substitutionsLabel}</label>
          <textarea
            id={substitutionsId}
            value={substitutions}
            onChange={(e) => setSubstitutions(e.target.value)}
            rows={6}
            className={textareaClass}
            placeholder={translationMessages.substitutionsPlaceholder}
          />
          <p className={`mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {translationMessages.substitutionsDescription}{' '}
            <code className="text-blue-400">원본/치환</code>
          </p>
        </div>
      </div>
    </div>
  );
};
