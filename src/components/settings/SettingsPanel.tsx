import React from 'react';
import { ApiKeyManager } from './ApiKeyManager';
import { PromptEditor } from './PromptEditor';

export const SettingsPanel: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">설정</h2>
        <p className="text-slate-400">API 키 및 번역 옵션을 관리합니다.</p>
      </div>
      
      <ApiKeyManager />
      <PromptEditor />
    </div>
  );
};
