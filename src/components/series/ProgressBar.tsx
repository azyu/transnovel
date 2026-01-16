import React from 'react';
import type { TranslationProgress } from '../../types';

interface ProgressBarProps {
  progress: TranslationProgress;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
  const percentage = Math.min(
    100,
    Math.max(0, (progress.current_chapter / progress.total_chapters) * 100)
  );

  return (
    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg w-full max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-medium text-white">
          {progress.status === 'completed' ? '번역 완료' : '번역 진행 중...'}
        </h3>
        <span className="text-sm text-slate-400">
          {progress.current_chapter} / {progress.total_chapters} 화 ({Math.round(percentage)}%)
        </span>
      </div>
      
      <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden mb-4">
        <div 
          className={`h-2.5 rounded-full transition-all duration-300 ${
            progress.status === 'error' ? 'bg-red-500' : 
            progress.status === 'completed' ? 'bg-green-500' : 'bg-blue-600'
          }`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="text-slate-300 truncate max-w-[70%]">
          <span className="text-slate-500 mr-2">현재 작업:</span>
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
