import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { UrlInput } from './UrlInput';
import { ParagraphList } from './ParagraphList';
import { SaveModal } from './SaveModal';
import { Button } from '../common/Button';
import { DebugPanel } from '../common/DebugPanel';
import { useUIStore } from '../../stores/uiStore';
import { useTranslationStore } from '../../stores/translationStore';
import { useTranslation } from '../../hooks/useTranslation';
import type { ApiKey } from '../../types';

interface AntigravityStatus {
  running: boolean;
  authenticated: boolean;
  url: string;
}

export const TranslationView: React.FC = () => {
  const theme = useUIStore((s) => s.theme);
  const chapter = useTranslationStore((s) => s.chapter);
  const translatedTitle = useTranslationStore((s) => s.translatedTitle);
  const translatedSubtitle = useTranslationStore((s) => s.translatedSubtitle);
  const paragraphIds = useTranslationStore((s) => s.paragraphIds);
  const translatedCount = useTranslationStore((s) => s.translatedCount);
  const isTranslating = useTranslationStore((s) => s.isTranslating);
  const setIsTranslating = useTranslationStore((s) => s.setIsTranslating);
  const setUrl = useTranslationStore((s) => s.setUrl);
  const failedParagraphIndices = useTranslationStore((s) => s.failedParagraphIndices);

  const { parseAndTranslate, retryFailedParagraphs } = useTranslation();
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const isDark = theme === 'dark';
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkApiConfig = async () => {
      try {
        const [keys, antigravity] = await Promise.all([
          invoke<ApiKey[]>('get_api_keys'),
          invoke<AntigravityStatus>('check_antigravity_status'),
        ]);
        
        const hasGeminiKey = keys.some(k => k.key_type === 'gemini');
        const hasAntigravity = antigravity.running && antigravity.authenticated;
        
        setApiConfigured(hasGeminiKey || hasAntigravity);
      } catch {
        setApiConfigured(false);
      }
    };
    
    checkApiConfig();
  }, []);

  const handleStop = () => {
    setIsTranslating(false);
  };

  const handlePrevChapter = async () => {
    if (!chapter?.prevUrl) return;
    setUrl(chapter.prevUrl);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    await parseAndTranslate(chapter.prevUrl);
  };

  const handleNextChapter = async () => {
    if (!chapter?.nextUrl) return;
    setUrl(chapter.nextUrl);
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
      alert(`저장 완료: ${path}`);
    } catch (err) {
      const errorMessage = String(err);
      if (!errorMessage.includes('취소')) {
        alert(`저장 실패: ${err}`);
      }
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
            <p className="text-yellow-500 font-medium">API 설정 필요</p>
            <p className="text-yellow-500/80 text-sm mt-1">
              번역을 사용하려면 설정 탭에서 Gemini API 키를 등록하거나 Antigravity Proxy를 실행해주세요.
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
            <p>번역할 소설의 URL을 입력하고 불러오세요</p>
          </div>
        )}
      </div>

      {chapter && (
        <div className={`py-4 px-6 border-t backdrop-blur absolute bottom-0 w-full max-w-7xl mx-auto left-0 right-0 z-10 flex justify-between items-center ${isDark ? 'border-slate-700 bg-slate-900/80' : 'border-slate-200 bg-white/80'}`}>
          <div className="flex items-center gap-4">
            <Button variant="secondary" onClick={() => setShowSaveModal(true)} disabled={isTranslating || retrying}>
              저장
            </Button>
            {failedParagraphIndices.length > 0 && !isTranslating && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-500">
                  {failedParagraphIndices.length}개 문단 실패
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
                  {retrying ? '재시도 중...' : '재시도'}
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
                  번역 중지
                </Button>
              </>
            ) : translatedCount === paragraphIds.length && paragraphIds.length > 0 ? (
              <div className="flex items-center gap-2">
                {chapter.prevUrl && (
                  <Button variant="secondary" onClick={handlePrevChapter}>
                    이전 화
                  </Button>
                )}
                {chapter.nextUrl && (
                  <Button onClick={handleNextChapter}>
                    다음 화
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
    </div>
  );
};
