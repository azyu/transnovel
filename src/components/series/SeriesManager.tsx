import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import { useTranslation } from '../../hooks/useTranslation';
import { UrlInput } from '../translation/UrlInput';
import { ChapterList } from './ChapterList';
import { ProgressBar } from './ProgressBar';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

export const SeriesManager: React.FC = () => {
  const { chapterList, batchProgress, isTranslating, setIsTranslating } = useAppStore();
  const { startBatchTranslation, exportNovel } = useTranslation();
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'TxtSingle' | 'TxtChapters' | 'Epub'>('TxtSingle');
  const [exporting, setExporting] = useState(false);

  const handleStart = async (start: number, end: number) => {
    const content = useAppStore.getState().chapterContent;
    if (!content) {
      alert("먼저 소설을 불러와주세요.");
      return;
    }

    await startBatchTranslation(content.novel_id, content.site, start, end);
  };

  const handlePause = async () => {
    await invoke('pause_translation');
    setIsTranslating(false);
  };

  const handleResume = async () => {
    await invoke('resume_translation');
    setIsTranslating(true);
  };

  const handleExport = async () => {
    const content = useAppStore.getState().chapterContent;
    if (!content) return;

    setExporting(true);
    try {
      await exportNovel(content.novel_id, {
        format: exportFormat,
        include_original: false,
        include_notes: false
      });
      setShowExportModal(false);
      alert('내보내기가 완료되었습니다.');
    } catch (e) {
      alert('내보내기 실패: ' + e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 pb-20">
      <UrlInput />

      {batchProgress && (
        <div className="space-y-4">
          <ProgressBar progress={batchProgress} />
          
          <div className="flex justify-center gap-4">
            {isTranslating ? (
              <Button variant="secondary" onClick={handlePause}>
                일시정지
              </Button>
            ) : batchProgress.status !== 'completed' && batchProgress.status !== 'error' ? (
              <Button onClick={handleResume}>
                재개
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {chapterList.length > 0 && (
        <>
          <ChapterList 
            chapters={chapterList} 
            onStartTranslation={handleStart} 
            isLoading={isTranslating} 
          />

          <div className="fixed bottom-6 right-6 z-20">
             <Button 
               size="lg" 
               className="shadow-xl"
               onClick={() => setShowExportModal(true)}
               disabled={isTranslating}
             >
               내보내기
             </Button>
          </div>
        </>
      )}

      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="소설 내보내기"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowExportModal(false)}>
              취소
            </Button>
            <Button onClick={handleExport} isLoading={exporting}>
              내보내기
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">파일 형식</label>
            <div className="grid grid-cols-3 gap-3">
              {(['TxtSingle', 'TxtChapters', 'Epub'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setExportFormat(fmt)}
                  className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                    exportFormat === fmt
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {fmt === 'TxtSingle' && 'TXT (통합)'}
                  {fmt === 'TxtChapters' && 'TXT (분할)'}
                  {fmt === 'Epub' && 'EPUB'}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-slate-400">
            * '다운로드' 폴더의 'AI Novel Translator' 폴더에 저장됩니다.
          </p>
        </div>
      </Modal>
    </div>
  );
};
