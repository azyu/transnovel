import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../common/Button';

export const PromptEditor: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState('gemini-2.5-flash-preview');

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await invoke<{ key: string; value: string }[]>('get_settings');
        const promptSetting = settings.find(s => s.key === 'custom_prompt');
        const modelSetting = settings.find(s => s.key === 'selected_model');
        
        if (promptSetting) setPrompt(promptSetting.value);
        if (modelSetting) setModel(modelSetting.value);
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await invoke('set_setting', { key: 'custom_prompt', value: prompt });
      await invoke('set_setting', { key: 'selected_model', value: model });
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
      <h3 className="text-lg font-medium text-white mb-4">번역 설정</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">사용 모델</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="gemini-2.5-flash-preview">Gemini 2.5 Flash Preview</option>
            <option value="gemini-3-flash-preview">Gemini 3.0 Flash Preview</option>
            <option value="claude-sonnet-4.5">Claude Sonnet 4.5 (Antigravity)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">사용자 지정 프롬프트</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-y"
            placeholder="{{note}} 와 {{slot}} 플레이스홀더를 포함해야 합니다."
          />
          <p className="mt-2 text-xs text-slate-500">
            기본 프롬프트가 적용되려면 비워두세요. <code>{`{{note}}`}</code>는 문맥 정보, <code>{`{{slot}}`}</code>은 번역할 텍스트입니다.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} isLoading={isLoading}>
            설정 저장
          </Button>
        </div>
      </div>
    </div>
  );
};
