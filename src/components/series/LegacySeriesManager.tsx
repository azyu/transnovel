import React, { useState } from 'react';
import { message } from '@tauri-apps/plugin-dialog';
import { getMessages } from '../../i18n';
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

export const LegacySeriesManager: React.FC = () => {
  const theme = useUIStore((s) => s.theme);
  const language = useUIStore((s) => s.language);
  const setTab = useUIStore((s) => s.setTab);
  const chapterList = useSeriesStore((s) => s.chapterList);
  const batchProgress = useSeriesStore((s) => s.batchProgress);
  const isTranslating = useTranslationStore((s) => s.isTranslating);
  const currentUrl = useTranslationStore((s) => s.currentUrl);
  const setUrl = useTranslationStore((s) => s.setUrl);

  const {
    startBatchTranslation,
    stopBatchTranslation,
    pauseBatchTranslation,
    resumeBatchTranslation,
    exportNovel,
    parseAndTranslate,
  } = useTranslation();
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'TxtSingle' | 'TxtChapters' | 'Epub'>(
    'TxtSingle',
  );
  const [exporting, setExporting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isDark = theme === 'dark';
  const legacyMessages = getMessages(language).series.legacy;

  const handleStart = async (start: number, end: number) => {
    const content = useTranslationStore.getState().getChapterContent();
    if (!content) {
      await message(legacyMessages.noNovelLoaded, {
        title: legacyMessages.alertTitle,
        kind: 'warning',
      });
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
    if (isTranslating) {
      return;
    }

    setUrl(chapter.url);
    setTab('translation');
    await parseAndTranslate(chapter.url);
  };

  const handleExport = async () => {
    const content = useTranslationStore.getState().getChapterContent();
    if (!content) {
      return;
    }

    setExporting(true);
    try {
      await exportNovel({
        novel_id: content.novel_id,
        novel_title: content.translatedTitle || content.title,
        chapters: [
          {
            number: 1,
            title: content.translatedSubtitle || content.subtitle || content.title,
            paragraphs: content.paragraphs.map((paragraph) => ({
              original: paragraph.original,
              translated: paragraph.translated ?? null,
            })),
          },
        ],
        options: {
          format: exportFormat,
          include_original: false,
          include_notes: false,
        },
      });
      setShowExportModal(false);
      await message(legacyMessages.exportCompleted, {
        title: legacyMessages.completedTitle,
        kind: 'info',
      });
    } catch (error) {
      await message(legacyMessages.exportFailed(String(error)), {
        title: legacyMessages.errorTitle,
        kind: 'error',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
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
              {legacyMessages.exportButton}
            </Button>
          </div>
        </>
      )}

      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title={legacyMessages.modalTitle}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowExportModal(false)}>
              {legacyMessages.cancel}
            </Button>
            <Button onClick={handleExport} isLoading={exporting}>
              {legacyMessages.export}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label
              className={`mb-2 block text-sm font-medium ${
                isDark ? 'text-slate-300' : 'text-slate-600'
              }`}
            >
              {legacyMessages.formatLabel}
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['TxtSingle', 'TxtChapters', 'Epub'] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => setExportFormat(format)}
                  aria-pressed={exportFormat === format}
                  className={`rounded-lg border p-3 text-sm font-medium transition-colors ${
                    exportFormat === format
                      ? 'border-blue-500 bg-blue-600 text-white'
                      : isDark
                        ? 'border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600'
                        : 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {format === 'TxtSingle' && legacyMessages.formats.txtSingle}
                  {format === 'TxtChapters' && legacyMessages.formats.txtChapters}
                  {format === 'Epub' && legacyMessages.formats.epub}
                </button>
              ))}
            </div>
          </div>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {legacyMessages.downloadsNote}
          </p>
        </div>
      </Modal>
    </>
  );
};
