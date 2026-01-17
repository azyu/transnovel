import React, { useState } from 'react';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useTranslation } from '../../hooks/useTranslation';
import { useAppStore } from '../../stores/appStore';

export const UrlInput: React.FC = () => {
  const { currentUrl, setUrl, isTranslating } = useAppStore();
  const { parseAndTranslate, loading } = useTranslation();
  const [localUrl, setLocalUrl] = useState(currentUrl);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localUrl || isTranslating) return;
    setUrl(localUrl);
    await parseAndTranslate(localUrl);
  };

  return (
    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
      <form onSubmit={handleSubmit} className="flex gap-4 items-end">
        <div className="flex-1">
          <Input
            label="소설 URL 입력"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            placeholder="https://ncode.syosetu.com/..."
            disabled={loading || isTranslating}
          />
        </div>
        <Button type="submit" isLoading={loading} disabled={!localUrl || isTranslating}>
          불러오기
        </Button>
      </form>
      <div className="mt-3 text-xs text-slate-500 flex gap-2">
        <span>지원 사이트:</span>
        <span className="text-slate-400">syosetu.com</span>
        <span className="text-slate-600">•</span>
        <span className="text-slate-400">syosetu.org (Hameln)</span>
        <span className="text-slate-600">•</span>
        <span className="text-slate-400">kakuyomu.jp</span>
      </div>
    </div>
  );
};
