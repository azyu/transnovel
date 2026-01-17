import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

type SaveFormat = 'txt' | 'html' | 'md';

interface SaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (format: SaveFormat, includeOriginal: boolean) => Promise<void>;
}

const FORMAT_OPTIONS: { value: SaveFormat; label: string; description: string }[] = [
  { value: 'txt', label: 'Text (.txt)', description: '단순 텍스트 형식' },
  { value: 'html', label: 'HTML (.html)', description: '웹 브라우저에서 열 수 있는 형식, 루비 텍스트 지원' },
  { value: 'md', label: 'Markdown (.md)', description: '마크다운 형식' },
];

export const SaveModal: React.FC<SaveModalProps> = ({ isOpen, onClose, onSave }) => {
  const [format, setFormat] = useState<SaveFormat>('txt');
  const [includeOriginal, setIncludeOriginal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
      title="번역 저장"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            취소
          </Button>
          <Button onClick={handleSave} isLoading={isSaving}>
            저장
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-3">
            저장 형식
          </label>
          <div className="space-y-2">
            {FORMAT_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex items-start p-3 rounded-lg cursor-pointer border transition-colors ${
                  format === option.value
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-600 hover:border-slate-500'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value={option.value}
                  checked={format === option.value}
                  onChange={(e) => setFormat(e.target.value as SaveFormat)}
                  className="mt-0.5 h-4 w-4 text-blue-500 border-slate-500 focus:ring-blue-500 focus:ring-offset-slate-800"
                />
                <div className="ml-3">
                  <span className="block text-sm font-medium text-white">
                    {option.label}
                  </span>
                  <span className="block text-xs text-slate-400">
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
              className="h-4 w-4 rounded border-slate-500 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
            />
            <div>
              <span className="block text-sm font-medium text-white">
                원문 포함
              </span>
              <span className="block text-xs text-slate-400">
                번역문과 함께 일본어 원문을 저장합니다
              </span>
            </div>
          </label>
        </div>
      </div>
    </Modal>
  );
};
