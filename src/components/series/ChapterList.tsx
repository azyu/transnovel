import React, { useState } from 'react';
import type { Chapter } from '../../types';
import { Button } from '../common/Button';
import { Input } from '../common/Input';

interface ChapterListProps {
  chapters: Chapter[];
  onStartTranslation: (start: number, end: number) => void;
  isLoading: boolean;
}

export const ChapterList: React.FC<ChapterListProps> = ({ chapters, onStartTranslation, isLoading }) => {
  const [start, setStart] = useState<number>(chapters.length > 0 ? chapters[0].number : 1);
  const [end, setEnd] = useState<number>(chapters.length > 0 ? chapters[chapters.length - 1].number : 1);

  const handleStart = () => {
    onStartTranslation(start, end);
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="p-4 border-b border-slate-700 flex flex-col md:flex-row items-center justify-between gap-4">
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
          <span className="text-slate-500 pt-6">~</span>
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
          <div className="text-sm text-slate-400">
            총 <span className="text-white font-bold">{chapters.length}</span> 화
          </div>
          <Button onClick={handleStart} isLoading={isLoading}>
            일괄 번역 시작
          </Button>
        </div>
      </div>

      <div className="max-h-[500px] overflow-y-auto p-2">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/50 text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium rounded-l-lg">번호</th>
              <th className="px-4 py-3 font-medium rounded-r-lg">제목</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {chapters.map((chapter) => (
              <tr 
                key={chapter.number} 
                className={`hover:bg-slate-700/30 transition-colors ${chapter.number >= start && chapter.number <= end ? 'bg-blue-500/5' : ''}`}
              >
                <td className="px-4 py-3 text-slate-400 w-20">#{chapter.number}</td>
                <td className="px-4 py-3 text-slate-200">{chapter.title}</td>
              </tr>
            ))}
            {chapters.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-slate-500">
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
