import { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { message } from '@tauri-apps/plugin-dialog';
import { UrlInput } from './UrlInput';
import { saveUrlHistory } from '../../utils/urlHistory';
import { ParagraphList } from './ParagraphList';
import { CharacterDictionaryModal } from './CharacterDictionaryModal';
import { SaveModal } from './SaveModal';
import { Button } from '../common/Button';
import { DebugPanel } from '../common/DebugPanel';
import { useWatchlist } from '../../hooks/useWatchlist';
import { useUIStore } from '../../stores/uiStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { useTranslationStore } from '../../stores/translationStore';
import { messages } from '../../i18n';
import { buildWatchlistWorkUrl, isWatchlistSupportedSite } from '../../utils/watchlist';
import {
  mergeCharacterDictionaryEntries,
  resolveCharacterDictionaryTarget,
  useTranslation,
} from '../../hooks/useTranslation';
import type { CharacterDictionaryEntry } from '../../types';

export const TranslationView: React.FC = () => {
  const theme = useUIStore((s) => s.theme);
  const showError = useUIStore((s) => s.showError);
  const showToast = useUIStore((s) => s.showToast);
  const watchlistItems = useSeriesStore((s) => s.watchlistItems);
  const chapter = useTranslationStore((s) => s.chapter);
  const translatedTitle = useTranslationStore((s) => s.translatedTitle);
  const translatedSubtitle = useTranslationStore((s) => s.translatedSubtitle);
  const paragraphIds = useTranslationStore((s) => s.paragraphIds);
  const translatedCount = useTranslationStore((s) => s.translatedCount);
  const isTranslating = useTranslationStore((s) => s.isTranslating);
  const setUrl = useTranslationStore((s) => s.setUrl);
  const failedParagraphIndices = useTranslationStore((s) => s.failedParagraphIndices);
  const pendingCharacterDictionaryReview = useTranslationStore((s) => s.pendingCharacterDictionaryReview);
  const setPendingCharacterDictionaryReview = useTranslationStore((s) => s.setPendingCharacterDictionaryReview);

  const { parseAndTranslate, retryFailedParagraphs, getCharacterDictionary, saveCharacterDictionary } = useTranslation();
  const { addWatchlistItem } = useWatchlist();
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showDictionaryModal, setShowDictionaryModal] = useState(false);
  const [dictionaryMode, setDictionaryMode] = useState<'review' | 'manual'>('manual');
  const [dictionaryEntries, setDictionaryEntries] = useState<CharacterDictionaryEntry[]>([]);
  const [dictionaryLoading, setDictionaryLoading] = useState(false);
  const [dictionarySaving, setDictionarySaving] = useState(false);
  const [addingWatchlist, setAddingWatchlist] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const isDark = theme === 'dark';
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const isTranslationComplete = 
    translatedCount === paragraphIds.length && 
    failedParagraphIndices.length === 0 &&
    paragraphIds.length > 0;
  const isAlreadyInWatchlist = chapter
    ? watchlistItems.some((item) => item.site === chapter.site && item.novelId === chapter.novelId)
    : false;

  const checkApiConfig = useCallback(async () => {
    try {
      const settings = await invoke<{ key: string; value: string }[]>('get_settings');
      const activeModelId = settings.find(s => s.key === 'active_model_id')?.value;
      
      if (!activeModelId) {
        setApiConfigured(false);
        return;
      }
      
      const modelsJson = settings.find(s => s.key === 'llm_models')?.value;
      const providersJson = settings.find(s => s.key === 'llm_providers')?.value;
      
      let models: { id: string; providerId: string }[] = [];
      let providers: { id: string }[] = [];
      
      try { models = modelsJson ? JSON.parse(modelsJson) : []; } catch { models = []; }
      try { providers = providersJson ? JSON.parse(providersJson) : []; } catch { providers = []; }
      
      const model = models.find(m => m.id === activeModelId);
      const hasValidConfig = !!model && providers.some(p => p.id === model.providerId);
      
      setApiConfigured(hasValidConfig);
    } catch {
      setApiConfigured(false);
    }
  }, []);

  useEffect(() => {
    const handleSettingsChange = () => void checkApiConfig();
    queueMicrotask(handleSettingsChange);
    window.addEventListener('settings-changed', handleSettingsChange);
    return () => window.removeEventListener('settings-changed', handleSettingsChange);
  }, [checkApiConfig]);

  const handleStop = async () => {
    try {
      await invoke('stop_translation');
    } catch (err) {
      showError(messages.translation.translation.stopFailed, String(err));
    }
  };

  const handlePrevChapter = async () => {
    if (!chapter?.prevUrl) return;
    setUrl(chapter.prevUrl);
    saveUrlHistory('url_history_chapter', chapter.prevUrl, {
      novelTitle: chapter.novelTitle ?? undefined,
      chapterNumber: chapter.chapterNumber > 0 ? chapter.chapterNumber - 1 : undefined,
      title: chapter.title,
    });
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    await parseAndTranslate(chapter.prevUrl);
  };

  const handleNextChapter = async () => {
    if (!chapter?.nextUrl) return;
    setUrl(chapter.nextUrl);
    saveUrlHistory('url_history_chapter', chapter.nextUrl, {
      novelTitle: chapter.novelTitle ?? undefined,
      chapterNumber: chapter.chapterNumber > 0 ? chapter.chapterNumber + 1 : undefined,
      title: chapter.title,
    });
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    await parseAndTranslate(chapter.nextUrl);
  };

  const handleSaveWithDialog = async (format: 'txt' | 'html' | 'md', includeOriginal: boolean) => {
    const chapterContent = useTranslationStore.getState().getChapterContent();
    if (!chapterContent) return;
    try {
      const path = await invoke<string>('save_chapter_with_dialog', {
        request: {
          title: chapterContent.translatedTitle || chapterContent.title,
          subtitle: chapterContent.translatedSubtitle || chapterContent.subtitle,
          paragraphs: chapterContent.paragraphs.map((p: { original: string; translated?: string }) => ({
            original: p.original,
            translated: p.translated,
          })),
          format,
          include_original: includeOriginal,
        },
      });
      await message(`저장 완료: ${path}`, { title: '저장 완료' });
    } catch (err) {
      const errorMessage = String(err);
      if (!errorMessage.includes('취소')) {
        await message(`저장 실패: ${err}`, { title: '오류', kind: 'error' });
      }
    }
  };

  useEffect(() => {
    if (!pendingCharacterDictionaryReview) {
      return;
    }

    setDictionaryMode('review');
    setDictionaryEntries(pendingCharacterDictionaryReview.entries);
    setShowDictionaryModal(true);
  }, [pendingCharacterDictionaryReview]);

  const handleOpenDictionary = async () => {
    if (!chapter) return;

    setDictionaryLoading(true);
    try {
      const entries = await getCharacterDictionary(chapter.site, chapter.novelId);
      setDictionaryMode('manual');
      setDictionaryEntries(entries);
      setShowDictionaryModal(true);
    } catch (err) {
      showError(messages.translation.dictionary.loadFailed, String(err));
    } finally {
      setDictionaryLoading(false);
    }
  };

  const handleCloseDictionary = () => {
    setShowDictionaryModal(false);
    if (dictionaryMode === 'review') {
      setPendingCharacterDictionaryReview(null);
    }
  };

  const handleSaveDictionary = async (entries: CharacterDictionaryEntry[]) => {
    const dictionaryTarget = resolveCharacterDictionaryTarget(
      dictionaryMode,
      chapter,
      pendingCharacterDictionaryReview,
    );
    if (!dictionaryTarget) {
      showError(
        messages.translation.dictionary.saveFailed,
        messages.translation.dictionary.missingTarget,
      );
      return;
    }

    setDictionarySaving(true);
    try {
      const entriesToSave = dictionaryMode === 'review'
        ? mergeCharacterDictionaryEntries(
            await getCharacterDictionary(dictionaryTarget.site, dictionaryTarget.novelId),
            entries,
          )
        : entries;

      await saveCharacterDictionary(dictionaryTarget.site, dictionaryTarget.novelId, entriesToSave);
      setShowDictionaryModal(false);
      setPendingCharacterDictionaryReview(null);
      showToast(messages.translation.dictionary.saveSuccess);
    } catch (err) {
      showError(messages.translation.dictionary.saveFailed, String(err));
    } finally {
      setDictionarySaving(false);
    }
  };

  const handleAddToWatchlist = async () => {
    if (!chapter || !isWatchlistSupportedSite(chapter.site)) {
      showError(
        messages.translation.watchlist.addFailed,
        messages.translation.watchlist.unsupportedSite,
      );
      return;
    }

    const workUrl = buildWatchlistWorkUrl(chapter.site, chapter.novelId);
    if (!workUrl) {
      showError(
        messages.translation.watchlist.addFailed,
        messages.translation.watchlist.buildUrlFailed,
      );
      return;
    }

    setAddingWatchlist(true);
    try {
      await addWatchlistItem(workUrl);
    } catch (err) {
      showError(messages.translation.watchlist.addFailed, String(err));
    } finally {
      setAddingWatchlist(false);
    }
  };

  return (
    <div className="h-full flex flex-col max-w-7xl mx-auto w-full">
      {apiConfigured === false && (
        <div className="mx-6 mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-3">
          <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-yellow-500 font-medium">{messages.translation.llmConfig.requiredTitle}</p>
            <p className="text-yellow-500/80 text-sm mt-1">
              {messages.translation.llmConfig.requiredDescription}
            </p>
          </div>
        </div>
      )}
      
      <div className="p-6 pb-0">
        <UrlInput historyKey="url_history_chapter" />
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-6">
        {chapter ? (
          <div className="space-y-8 pb-20">
            <header className={`border-b pb-6 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className="mb-2">
                {translatedTitle ? (
                  <>
                    <p className={`text-sm mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{chapter.title}</p>
                    <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{translatedTitle}</h1>
                  </>
                ) : (
                  <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{chapter.title}</h1>
                )}
              </div>
              {chapter.subtitle && (
                <div>
                  {translatedSubtitle ? (
                    <>
                      <p className={`text-sm mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{chapter.subtitle}</p>
                      <h2 className={`text-xl ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{translatedSubtitle}</h2>
                    </>
                  ) : (
                    <h2 className={`text-xl ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{chapter.subtitle}</h2>
                  )}
                </div>
              )}
            </header>

            <ParagraphList />
          </div>
        ) : (
          <div className={`h-full flex flex-col items-center justify-center space-y-4 opacity-50 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <p>{messages.translation.urlInput.emptyState}</p>
          </div>
        )}
      </div>

      {chapter && (
        <div className={`py-4 px-6 border-t backdrop-blur absolute bottom-0 w-full max-w-7xl mx-auto left-0 right-0 z-10 flex justify-between items-center ${isDark ? 'border-slate-700 bg-slate-900/80' : 'border-slate-200 bg-white/80'}`}>
          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              onClick={handleAddToWatchlist}
              isLoading={addingWatchlist}
              disabled={
                isTranslating ||
                retrying ||
                !chapter ||
                !isWatchlistSupportedSite(chapter.site) ||
                isAlreadyInWatchlist
              }
            >
              {messages.translation.addToWatchlist}
            </Button>
            <Button variant="secondary" onClick={() => setShowSaveModal(true)} disabled={isTranslating || retrying || !isTranslationComplete}>
              {messages.common.actions.save}
            </Button>
            <Button variant="secondary" onClick={handleOpenDictionary} disabled={isTranslating || retrying || dictionaryLoading}>
              {dictionaryLoading ? messages.translation.dictionary.loading : messages.translation.dictionary.open}
            </Button>
            {failedParagraphIndices.length > 0 && !isTranslating && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-500">
                  {messages.translation.translation.failedItems(failedParagraphIndices.length)}
                </span>
                <Button 
                  variant="secondary" 
                  onClick={async () => {
                    setRetrying(true);
                    await retryFailedParagraphs();
                    setRetrying(false);
                  }}
                  disabled={retrying}
                >
                  {retrying ? messages.translation.translation.retrying : messages.translation.translation.retry}
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            {isTranslating ? (
              <>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'}`}>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>
                    {translatedCount} / {paragraphIds.length}
                  </span>
                </div>
                <Button variant="danger" onClick={handleStop}>
                  {messages.translation.translation.stop}
                </Button>
              </>
            ) : translatedCount === paragraphIds.length && paragraphIds.length > 0 ? (
              <div className="flex items-center gap-2">
                {chapter.prevUrl && (
                  <Button variant="secondary" onClick={handlePrevChapter}>
                    {messages.translation.navigation.prevChapter}
                  </Button>
                )}
                {chapter.nextUrl && (
                  <Button onClick={handleNextChapter}>
                    {messages.translation.navigation.nextChapter}
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-20">
        <DebugPanel />
      </div>

      <SaveModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSaveWithDialog}
      />
      <CharacterDictionaryModal
        key={`${dictionaryMode}:${chapter?.novelId ?? 'none'}:${JSON.stringify(dictionaryEntries)}`}
        isOpen={showDictionaryModal}
        title={dictionaryMode === 'review' ? '고유명사 사전 후보 확인' : '사용자 정의 고유명사 사전'}
        description={dictionaryMode === 'review'
          ? '이번 화 번역에서 새로 추출된 고유명사 후보입니다. 저장하면 현재 작품의 이후 번역에 자동으로 적용됩니다.'
          : '현재 작품에 등록된 고유명사 사전을 수정합니다. 저장 시 기존 번역 캐시는 초기화됩니다.'}
        entries={dictionaryEntries}
        saveLabel={dictionaryMode === 'review' ? '후보 저장' : '사전 저장'}
        isSaving={dictionarySaving}
        onClose={handleCloseDictionary}
        onSave={handleSaveDictionary}
      />
    </div>
  );
};
