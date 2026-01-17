import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { UrlInput } from './UrlInput';
import { ParagraphList } from './ParagraphList';
import { Button } from '../common/Button';
import { useAppStore } from '../../stores/appStore';
import { useTranslation } from '../../hooks/useTranslation';
import type { ApiKey } from '../../types';

interface AntigravityStatus {
  running: boolean;
  authenticated: boolean;
  url: string;
}

export const TranslationView: React.FC = () => {
  const { chapterContent, isTranslating, setIsTranslating, updateAllTranslations } = useAppStore();
  const { translateParagraphs } = useTranslation();
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);

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

  const handleTranslateAll = async () => {
    if (!chapterContent) return;
    
    setIsTranslating(true);
    
    try {
      const untranslatedParagraphs = chapterContent.paragraphs
        .filter(p => !p.translated)
        .map(p => p.original);
      
      if (untranslatedParagraphs.length === 0) return;
      
      const translated = await translateParagraphs(untranslatedParagraphs);
      
      const allTranslations = chapterContent.paragraphs.map((p, i) => {
        if (p.translated) return p.translated;
        const untranslatedIndex = chapterContent.paragraphs
          .slice(0, i + 1)
          .filter(pp => !pp.translated)
          .length - 1;
        return translated[untranslatedIndex] || '';
      });
      
      updateAllTranslations(allTranslations);
    } catch (e) {
      console.error('Translation failed:', e);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleStop = () => {
    setIsTranslating(false);
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
              번역을 사용하려면 설정 탭에서 Gemini API 키를 등록하거나 Antigravity 프록시를 실행해주세요.
            </p>
          </div>
        </div>
      )}
      
      <div className="p-6 pb-0">
        <UrlInput />
      </div>

      <div className="flex-1 overflow-auto p-6">
        {chapterContent ? (
          <div className="space-y-8 pb-20">
            <header className="border-b border-slate-700 pb-6">
              <h1 className="text-2xl font-bold text-white mb-2">{chapterContent.title}</h1>
              {chapterContent.subtitle && (
                <h2 className="text-xl text-slate-300">{chapterContent.subtitle}</h2>
              )}
            </header>

            <ParagraphList paragraphs={chapterContent.paragraphs} />
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4 opacity-50">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <p>번역할 소설의 URL을 입력하고 불러오세요</p>
          </div>
        )}
      </div>

      {chapterContent && (
        <div className="p-4 border-t border-slate-700 bg-slate-900/80 backdrop-blur absolute bottom-0 w-full max-w-7xl mx-auto left-0 right-0 z-10 flex justify-end gap-4">
          {isTranslating ? (
            <Button variant="danger" onClick={handleStop}>
              번역 중지
            </Button>
          ) : (
            <Button onClick={handleTranslateAll}>
              전체 번역 시작
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
