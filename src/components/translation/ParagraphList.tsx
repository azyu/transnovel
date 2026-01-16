import React from 'react';
import type { Paragraph } from '../../types';

interface ParagraphListProps {
  paragraphs: Paragraph[];
}

export const ParagraphList: React.FC<ParagraphListProps> = ({ paragraphs }) => {
  return (
    <div className="space-y-6">
      {paragraphs.map((p) => (
        <div key={p.id} className="group grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 p-4 rounded-lg hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-700/50">
          <div className="relative">
            <div className="absolute -left-3 top-0 text-[10px] font-mono text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
              {p.id}
            </div>
            <div 
              className="text-slate-300 leading-relaxed break-words text-base whitespace-pre-wrap font-jp"
              dangerouslySetInnerHTML={{ __html: p.original }} 
            />
          </div>

          <div className="relative min-h-[1.5em]">
            {p.translated ? (
              <div className="text-white leading-relaxed break-words text-base whitespace-pre-wrap font-kr animate-fade-in">
                {p.translated}
              </div>
            ) : (
              <div className="text-slate-600 text-sm italic opacity-20">
                번역 대기 중...
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
