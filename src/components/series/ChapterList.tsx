import React, { useState } from 'react';
import { messages } from '../../i18n';
import type { Chapter } from '../../types';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useUIStore } from '../../stores/uiStore';

interface ChapterListProps {
  chapters: Chapter[];
  onStartTranslation: (start: number, end: number) => void;
  onChapterDoubleClick?: (chapter: Chapter) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export const ChapterList: React.FC<ChapterListProps> = ({ chapters, onStartTranslation, onChapterDoubleClick, isLoading, disabled }) => {
  const [start, setStart] = useState<number>(1);
  const [end, setEnd] = useState<number>(1);
  const [prevChapters, setPrevChapters] = useState(chapters);
  const isDark = useUIStore((state) => state.theme) === 'dark';
  const chapterListMessages = messages.series.chapterList;

  if (chapters !== prevChapters) {
    setPrevChapters(chapters);
    if (chapters.length > 0) {
      setStart(chapters[0].number);
      setEnd(chapters[chapters.length - 1].number);
    }
  }

  const handleStart = () => {
    onStartTranslation(start, end);
  };

  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className={`p-4 border-b flex flex-col md:flex-row items-center justify-between gap-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-24">
            <Input
              type="number"
              label={chapterListMessages.startLabel}
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
              min={1}
            />
          </div>
          <span className={`pt-6 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>~</span>
          <div className="w-24">
            <Input
              type="number"
              label={chapterListMessages.endLabel}
              value={end}
              onChange={(e) => setEnd(Number(e.target.value))}
              min={start}
            />
          </div>
        </div>
        
        <div className="flex items-center gap-4 w-full md:w-auto justify-end">
          <div className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {chapterListMessages.totalChapters(chapters.length)}
          </div>
          <Button onClick={handleStart} isLoading={isLoading} disabled={disabled}>
            {chapterListMessages.startBatch}
          </Button>
        </div>
      </div>

      <div className="max-h-[500px] overflow-y-auto p-2">
        <table className="w-full text-left text-sm">
          <thead className={isDark ? 'bg-slate-900/50 text-slate-400' : 'bg-slate-100 text-slate-500'}>
            <tr>
              <th className="px-4 py-3 font-medium rounded-l-lg w-12"></th>
              <th className="px-4 py-3 font-medium">{chapterListMessages.columns.number}</th>
              <th className="px-4 py-3 font-medium rounded-r-lg">{chapterListMessages.columns.title}</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDark ? 'divide-slate-700/50' : 'divide-slate-200'}`}>
            {chapters.map((chapter) => (
              <tr 
                key={chapter.number} 
                className={`transition-colors ${isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'} ${chapter.number >= start && chapter.number <= end ? 'bg-blue-500/5' : ''}`}
              >
                <td className="px-4 py-3 w-12 text-center">
                  {chapter.status === 'completed' && <span className="text-green-500">✓</span>}
                </td>
                <td className={`px-4 py-3 w-20 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>#{chapter.number}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={!onChapterDoubleClick}
                    onDoubleClick={() => onChapterDoubleClick?.(chapter)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && onChapterDoubleClick) {
                        e.preventDefault();
                        onChapterDoubleClick(chapter);
                      }
                    }}
                    onKeyUp={(e) => {
                      if (e.key === ' ' && onChapterDoubleClick) {
                        e.preventDefault();
                        onChapterDoubleClick(chapter);
                      }
                    }}
                    aria-label={chapterListMessages.openChapterAriaLabel(chapter.number, chapter.title)}
                    className={`w-full text-left bg-transparent border-0 p-0 ${isDark ? 'text-slate-200' : 'text-slate-700'} ${
                      onChapterDoubleClick ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    {chapter.title}
                  </button>
                </td>
              </tr>
            ))}
            {chapters.length === 0 && (
              <tr>
                <td colSpan={3} className={`px-4 py-8 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {chapterListMessages.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
