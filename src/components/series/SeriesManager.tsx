import React, { useState } from 'react';
import { message } from '@tauri-apps/plugin-dialog';
import { useUIStore } from '../../stores/uiStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { useTranslationStore } from '../../stores/translationStore';
import { useTranslation } from '../../hooks/useTranslation';
import { UrlInput } from '../translation/UrlInput';
import { ChapterList } from './ChapterList';
import { BatchTranslationModal } from './BatchTranslationModal';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import type { Chapter } from '../../types';

export const SeriesManager: React.FC = () => {
  const theme = useUIStore((s) => s.theme);
  const setTab = useUIStore((s) => s.setTab);
  const chapterList = useSeriesStore((s) => s.chapterList);
  const batchProgress = useSeriesStore((s) => s.batchProgress);
  const isTranslating = useTranslationStore((s) => s.isTranslating);
  const currentUrl = useTranslationStore((s) => s.currentUrl);
  const setUrl = useTranslationStore((s) => s.setUrl);
  
  const { startBatchTranslation, stopBatchTranslation, pauseBatchTranslation, resumeBatchTranslation, exportNovel, parseAndTranslate } = useTranslation();
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'TxtSingle' | 'TxtChapters' | 'Epub'>('TxtSingle');
  const [exporting, setExporting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isDark = theme === 'dark';

  const handleStart = async (start: number, end: number) => {
    const content = useTranslationStore.getState().getChapterContent();
    if (!content) {
      await message('먼저 소설을 불러와주세요.', { title: '알림', kind: 'warning' });
      return;
    }

    setIsPaused(false);
    await startBatchTranslation(content.novel_id, content.site, start, end, currentUrl);
  };

  const handlePause = async () => {
    await pauseBatchTranslation();
    setIsPaused(true);
  };

  const handleResume = async () => {
    await resumeBatchTranslation();
    setIsPaused(false);
  };

  const handleStop = async () => {
    await stopBatchTranslation();
    setIsPaused(false);
  };

  const handleChapterDoubleClick = async (chapter: Chapter) => {
    if (isTranslating) return;
    setUrl(chapter.url);
    setTab('translation');
    await parseAndTranslate(chapter.url);
  };

  const handleExport = async () => {
    const content = useTranslationStore.getState().getChapterContent();
    if (!content) return;

    setExporting(true);
    try {
      await exportNovel({
        novel_id: content.novel_id,
        novel_title: content.translatedTitle || content.title,
        chapters: [{
          number: 1,
          title: content.translatedSubtitle || content.subtitle || content.title,
          paragraphs: content.paragraphs.map(p => ({
            original: p.original,
            translated: p.translated ?? null,
          })),
        }],
        options: {
          format: exportFormat,
          include_original: false,
          include_notes: false
        }
      });
      setShowExportModal(false);
      await message('내보내기가 완료되었습니다.', { title: '완료', kind: 'info' });
    } catch (e) {
      await message(`내보내기 실패: ${e}`, { title: '오류', kind: 'error' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 pb-20">
      <UrlInput historyKey="url_history_series" parseOnly />

      {batchProgress && batchProgress.status === 'translating' && (
        <BatchTranslationModal
          progress={batchProgress}
          isPaused={isPaused}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
        />
      )}

      {chapterList.length > 0 && (
        <>
          <ChapterList 
            chapters={chapterList} 
            onStartTranslation={handleStart} 
            onChapterDoubleClick={handleChapterDoubleClick}
            isLoading={batchProgress?.status === 'translating'}
            disabled={isTranslating}
          />

          <div className="fixed bottom-6 right-6 z-20">
             <Button 
               size="lg" 
               className="shadow-xl"
               onClick={() => setShowExportModal(true)}
               disabled={batchProgress?.status === 'translating'}
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
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>파일 형식</label>
            <div className="grid grid-cols-3 gap-3">
              {(['TxtSingle', 'TxtChapters', 'Epub'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setExportFormat(fmt)}
                  className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                    exportFormat === fmt
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : isDark 
                        ? 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                        : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {fmt === 'TxtSingle' && 'TXT (통합)'}
                  {fmt === 'TxtChapters' && 'TXT (분할)'}
                  {fmt === 'Epub' && 'EPUB'}
                </button>
              ))}
            </div>
          </div>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            * '다운로드' 폴더에 저장됩니다.
          </p>
        </div>
      </Modal>
    </div>
  );
};
