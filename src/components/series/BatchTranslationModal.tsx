import React from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../../stores/uiStore';
import { Button } from '../common/Button';
import type { TranslationProgress } from '../../types';

interface BatchTranslationModalProps {
  progress: TranslationProgress;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export const BatchTranslationModal: React.FC<BatchTranslationModalProps> = ({
  progress,
  isPaused,
  onPause,
  onResume,
  onStop,
}) => {
  const isDark = useUIStore((state) => state.theme) === 'dark';
  const percentage = Math.min(
    100,
    Math.max(0, (progress.current_chapter / progress.total_chapters) * 100)
  );

  const statusText = isPaused ? '일시정지됨' : 
    progress.status === 'error' ? '오류 발생' : 
    progress.status === 'completed' ? '완료' : '번역 중...';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/60 backdrop-blur-sm p-4">
      <div className={`relative w-full max-w-md rounded-xl shadow-2xl ${isDark ? 'bg-slate-800 ring-1 ring-white/10' : 'bg-white ring-1 ring-black/10'}`}>
        <div className={`p-6 space-y-6`}>
          <div className="text-center">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
              isPaused ? 'bg-yellow-500/20' : 'bg-blue-500/20'
            }`}>
              {isPaused ? (
                <svg className="w-8 h-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                </svg>
              ) : (
                <svg className={`w-8 h-8 text-blue-500 animate-spin`} fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
            </div>
            <h3 className={`text-xl font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              일괄 번역 {statusText}
            </h3>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {progress.chapter_title}
            </p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                진행률
              </span>
              <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {progress.current_chapter} / {progress.total_chapters} 화
              </span>
            </div>
            <div className={`w-full rounded-full h-3 overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  isPaused ? 'bg-yellow-500' :
                  progress.status === 'error' ? 'bg-red-500' :
                  'bg-blue-600'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className={`text-center mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {Math.round(percentage)}% 완료
            </div>
          </div>

          {progress.status === 'error' && progress.error_message && (
            <div className={`p-3 rounded-lg text-sm ${isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-700'}`}>
              {progress.error_message}
            </div>
          )}

          <div className="flex gap-3">
            {isPaused ? (
              <Button className="flex-1" onClick={onResume}>
                재개
              </Button>
            ) : (
              <Button className="flex-1" variant="secondary" onClick={onPause}>
                일시정지
              </Button>
            )}
            <Button className="flex-1" variant="danger" onClick={onStop}>
              중지
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
