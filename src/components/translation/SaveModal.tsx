import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useUIStore } from '../../stores/uiStore';
import { messages } from '../../i18n';

type SaveFormat = 'txt' | 'html';

interface SaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (format: SaveFormat, includeOriginal: boolean) => Promise<void>;
}

export const SaveModal: React.FC<SaveModalProps> = ({ isOpen, onClose, onSave }) => {
  const [format, setFormat] = useState<SaveFormat>('txt');
  const [includeOriginal, setIncludeOriginal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isDark = useUIStore((state) => state.theme) === 'dark';
  const formatOptions: { value: SaveFormat; label: string; description: string }[] = [
    {
      value: 'txt',
      label: messages.translation.saveModal.formats.txt.label,
      description: messages.translation.saveModal.formats.txt.description,
    },
    {
      value: 'html',
      label: messages.translation.saveModal.formats.html.label,
      description: messages.translation.saveModal.formats.html.description,
    },
  ];

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(format, includeOriginal);
      onClose();
    } catch {
      // empty - parent handles error display
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={messages.translation.saveModal.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            {messages.translation.saveModal.cancel}
          </Button>
          <Button onClick={handleSave} isLoading={isSaving}>
            {messages.translation.saveModal.save}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <label className={`block text-sm font-medium mb-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            {messages.translation.saveModal.formatLabel}
          </label>
          <div className="space-y-2">
            {formatOptions.map((option) => (
              <label
                key={option.value}
                className={`flex items-start p-3 rounded-lg cursor-pointer border transition-colors ${
                  format === option.value
                    ? 'border-blue-500 bg-blue-500/10'
                    : isDark ? 'border-slate-600 hover:border-slate-500' : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value={option.value}
                  checked={format === option.value}
                  onChange={(e) => setFormat(e.target.value as SaveFormat)}
                  className={`mt-0.5 h-4 w-4 text-blue-500 focus:ring-blue-500 ${isDark ? 'border-slate-500 focus:ring-offset-slate-800' : 'border-slate-300 focus:ring-offset-white'}`}
                />
                <div className="ml-3">
                  <span className={`block text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {option.label}
                  </span>
                  <span className={`block text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {option.description}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeOriginal}
              onChange={(e) => setIncludeOriginal(e.target.checked)}
              className={`h-4 w-4 rounded text-blue-500 focus:ring-blue-500 ${isDark ? 'border-slate-500 focus:ring-offset-slate-800' : 'border-slate-300 focus:ring-offset-white'}`}
            />
            <div>
              <span className={`block text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {messages.translation.saveModal.includeOriginal.label}
              </span>
              <span className={`block text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {messages.translation.saveModal.includeOriginal.description}
              </span>
            </div>
          </label>
        </div>
      </div>
    </Modal>
  );
};
