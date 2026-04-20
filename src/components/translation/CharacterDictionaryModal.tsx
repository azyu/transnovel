import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useUIStore } from '../../stores/uiStore';
import { getMessages } from '../../i18n';
import type { CharacterDictionaryEntry } from '../../types';

interface CharacterDictionaryModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  entries: CharacterDictionaryEntry[];
  saveLabel: string;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (entries: CharacterDictionaryEntry[]) => Promise<void>;
}

const createEmptyEntry = (): CharacterDictionaryEntry => ({
  source_text: '',
  reading: '',
  target_name: '',
  note: '',
});

const createDraftEntries = (entries: CharacterDictionaryEntry[]): CharacterDictionaryEntry[] =>
  entries.length > 0
    ? entries.map((entry) => ({ ...entry }))
    : [createEmptyEntry()];

export const CharacterDictionaryModal: React.FC<CharacterDictionaryModalProps> = ({
  isOpen,
  title,
  description,
  entries,
  saveLabel,
  isSaving = false,
  onClose,
  onSave,
}) => {
  const theme = useUIStore((state) => state.theme);
  const language = useUIStore((state) => state.language);
  const isDark = theme === 'dark';
  const translationMessages = getMessages(language).translation;
  const [draftEntries, setDraftEntries] = useState<CharacterDictionaryEntry[]>(
    createDraftEntries(entries),
  );
  const [draftSeed, setDraftSeed] = useState(entries);

  if (draftSeed !== entries) {
    setDraftSeed(entries);
    setDraftEntries(createDraftEntries(entries));
  }

  const updateEntry = (
    index: number,
    field: keyof CharacterDictionaryEntry,
    value: string,
  ) => {
    setDraftEntries((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    );
  };

  const removeEntry = (index: number) => {
    setDraftEntries((current) => {
      if (current.length === 1) {
        return [createEmptyEntry()];
      }
      return current.filter((_, entryIndex) => entryIndex !== index);
    });
  };

  const handleSave = async () => {
    await onSave(draftEntries);
  };

  const inputClass = `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
    isDark
      ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500'
      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
  }`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            {translationMessages.dictionaryModal.actions.cancel}
          </Button>
          <Button onClick={handleSave} isLoading={isSaving}>
            {saveLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          {description}
        </p>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {draftEntries.map((entry, index) => (
            <div
              key={`${index}-${entry.source_text}-${entry.target_name}`}
              className={`rounded-xl border p-4 ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {translationMessages.dictionaryModal.fields.sourceText.label}
                  </span>
                  <input
                    value={entry.source_text}
                    onChange={(event) => updateEntry(index, 'source_text', event.target.value)}
                    className={inputClass}
                    placeholder={translationMessages.dictionaryModal.fields.sourceText.placeholder}
                  />
                </label>

                <label className="space-y-1">
                  <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {translationMessages.dictionaryModal.fields.reading.label}
                  </span>
                  <input
                    value={entry.reading ?? ''}
                    onChange={(event) => updateEntry(index, 'reading', event.target.value)}
                    className={inputClass}
                    placeholder={translationMessages.dictionaryModal.fields.reading.placeholder}
                  />
                </label>

                <label className="space-y-1">
                  <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {translationMessages.dictionaryModal.fields.targetName.label}
                  </span>
                  <input
                    value={entry.target_name}
                    onChange={(event) => updateEntry(index, 'target_name', event.target.value)}
                    className={inputClass}
                    placeholder={translationMessages.dictionaryModal.fields.targetName.placeholder}
                  />
                </label>

                <label className="space-y-1">
                  <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {translationMessages.dictionaryModal.fields.note.label}
                  </span>
                  <input
                    value={entry.note ?? ''}
                    onChange={(event) => updateEntry(index, 'note', event.target.value)}
                    className={inputClass}
                    placeholder={translationMessages.dictionaryModal.fields.note.placeholder}
                  />
                </label>
              </div>

              <div className="mt-3 flex justify-end">
                <Button variant="danger" size="sm" onClick={() => removeEntry(index)} disabled={isSaving}>
                  {translationMessages.dictionaryModal.actions.remove}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-start">
          <Button variant="secondary" size="sm" onClick={() => setDraftEntries((current) => [...current, createEmptyEntry()])} disabled={isSaving}>
            {translationMessages.dictionaryModal.actions.addEntry}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
