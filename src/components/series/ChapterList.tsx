import React, { useState, useEffect } from 'react';
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
  const isDark = useUIStore((state) => state.theme) === 'dark';

  // Sync start/end when chapters change (new series loaded)
  useEffect(() => {
    if (chapters.length > 0) {
      setStart(chapters[0].number);
      setEnd(chapters[chapters.length - 1].number);
    }
  }, [chapters]);

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
              label="시작 화"
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
              min={1}
            />
          </div>
          <span className={`pt-6 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>~</span>
          <div className="w-24">
            <Input
              type="number"
              label="종료 화"
              value={end}
              onChange={(e) => setEnd(Number(e.target.value))}
              min={start}
            />
          </div>
        </div>
        
        <div className="flex items-center gap-4 w-full md:w-auto justify-end">
          <div className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            총 <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{chapters.length}</span> 화
          </div>
          <Button onClick={handleStart} isLoading={isLoading} disabled={disabled}>
            일괄 번역 시작
          </Button>
        </div>
      </div>

      <div className="max-h-[500px] overflow-y-auto p-2">
        <table className="w-full text-left text-sm">
          <thead className={isDark ? 'bg-slate-900/50 text-slate-400' : 'bg-slate-100 text-slate-500'}>
            <tr>
              <th className="px-4 py-3 font-medium rounded-l-lg w-12"></th>
              <th className="px-4 py-3 font-medium">번호</th>
              <th className="px-4 py-3 font-medium rounded-r-lg">제목</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDark ? 'divide-slate-700/50' : 'divide-slate-200'}`}>
            {chapters.map((chapter) => (
              <tr 
                key={chapter.number} 
                className={`transition-colors cursor-pointer ${isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'} ${chapter.number >= start && chapter.number <= end ? 'bg-blue-500/5' : ''}`}
                onDoubleClick={() => onChapterDoubleClick?.(chapter)}
              >
                <td className="px-4 py-3 w-12 text-center">
                  {chapter.status === 'completed' && <span className="text-green-500">✓</span>}
                </td>
                <td className={`px-4 py-3 w-20 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>#{chapter.number}</td>
                <td className={`px-4 py-3 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{chapter.title}</td>
              </tr>
            ))}
            {chapters.length === 0 && (
              <tr>
                <td colSpan={3} className={`px-4 py-8 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  챕터 목록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
