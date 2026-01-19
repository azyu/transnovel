import React from 'react';
import type { TranslationProgress } from '../../types';
import { useUIStore } from '../../stores/uiStore';

interface ProgressBarProps {
  progress: TranslationProgress;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
  const isDark = useUIStore((state) => state.theme) === 'dark';
  const percentage = Math.min(
    100,
    Math.max(0, (progress.current_chapter / progress.total_chapters) * 100)
  );

  return (
    <div className={`p-6 rounded-xl border shadow-lg w-full max-w-3xl mx-auto ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className="flex justify-between items-center mb-2">
        <h3 className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
          {progress.status === 'completed' ? '번역 완료' : '번역 진행 중...'}
        </h3>
        <span className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          {progress.current_chapter} / {progress.total_chapters} 화 ({Math.round(percentage)}%)
        </span>
      </div>
      
      <div className={`w-full rounded-full h-2.5 overflow-hidden mb-4 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
        <div 
          className={`h-2.5 rounded-full transition-all duration-300 ${
            progress.status === 'error' ? 'bg-red-500' : 
            progress.status === 'completed' ? 'bg-green-500' : 'bg-blue-600'
          }`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className={`truncate max-w-[70%] ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          <span className={`mr-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>현재 작업:</span>
          {progress.chapter_title}
        </div>
        
        {progress.status === 'error' && (
          <div className="text-red-400">
            오류: {progress.error_message || '알 수 없는 오류'}
          </div>
        )}
      </div>
    </div>
  );
};
