import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../common/Button';
import { Input } from '../common/Input';

interface ViewConfig {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  textColor: string;
  backgroundColor: string;
  originalOpacity: string;
  paragraphSpacing: string;
  textIndent: string;
  horizontalPadding: string;
  showOriginal: boolean;
  forceDialogueBreak: boolean;
}

const DEFAULT_CONFIG: ViewConfig = {
  fontFamily: 'Pretendard',
  fontSize: '16',
  fontWeight: '400',
  lineHeight: '1.8',
  textColor: '#ffffff',
  backgroundColor: '#0f172a',
  originalOpacity: '60',
  paragraphSpacing: '8',
  textIndent: '0',
  horizontalPadding: '24',
  showOriginal: true,
  forceDialogueBreak: false,
};

const COLOR_PRESETS = [
  { name: '다크 (기본)', text: '#ffffff', bg: '#0f172a' },
  { name: '세피아', text: '#5c4b37', bg: '#f4ecd8' },
  { name: '라이트', text: '#1f2937', bg: '#f9fafb' },
  { name: '다크 그린', text: '#e2e8f0', bg: '#1a2e1a' },
  { name: '아몰레드', text: '#e5e5e5', bg: '#000000' },
];

export const ViewSettings: React.FC = () => {
  const [config, setConfig] = useState<ViewConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await invoke<{ key: string; value: string }[]>('get_settings');
        const viewConfig = settings.find(s => s.key === 'view_config');
        if (viewConfig) {
          setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(viewConfig.value) });
        }
      } catch (error) {
        console.error('Failed to load view settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await invoke('set_setting', { key: 'view_config', value: JSON.stringify(config) });
    } catch (error) {
      console.error('Failed to save view settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    if (confirm('기본 설정으로 초기화하시겠습니까?')) {
      setConfig(DEFAULT_CONFIG);
    }
  };

  const applyPreset = (preset: typeof COLOR_PRESETS[0]) => {
    setConfig(prev => ({
      ...prev,
      textColor: preset.text,
      backgroundColor: preset.bg,
    }));
  };

  const updateConfig = <K extends keyof ViewConfig>(key: K, value: ViewConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-700 pb-4">
        <h2 className="text-xl font-semibold text-white">보기 설정</h2>
        <p className="text-sm text-slate-400 mt-1">번역 결과의 표시 방식을 설정합니다.</p>
      </div>

      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-6">
        <div>
          <h3 className="text-sm font-medium text-slate-300 mb-3">색상 프리셋</h3>
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className="px-3 py-1.5 rounded-lg text-sm border border-slate-600 hover:border-blue-500 transition-colors flex items-center gap-2"
                style={{ backgroundColor: preset.bg, color: preset.text }}
              >
                <span className="w-3 h-3 rounded-full border border-current" style={{ backgroundColor: preset.text }} />
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Input
              label="폰트"
              value={config.fontFamily}
              onChange={(e) => updateConfig('fontFamily', e.target.value)}
              placeholder="Pretendard"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="글자 크기 (px)"
              type="number"
              value={config.fontSize}
              onChange={(e) => updateConfig('fontSize', e.target.value)}
            />
            <Input
              label="글자 두께"
              type="number"
              value={config.fontWeight}
              onChange={(e) => updateConfig('fontWeight', e.target.value)}
              placeholder="400"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="글자 색상"
            type="color"
            value={config.textColor}
            onChange={(e) => updateConfig('textColor', e.target.value)}
          />
          <Input
            label="배경 색상"
            type="color"
            value={config.backgroundColor}
            onChange={(e) => updateConfig('backgroundColor', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="줄 간격"
            type="number"
            step="0.1"
            value={config.lineHeight}
            onChange={(e) => updateConfig('lineHeight', e.target.value)}
          />
          <Input
            label="문단 간격 (px)"
            type="number"
            value={config.paragraphSpacing}
            onChange={(e) => updateConfig('paragraphSpacing', e.target.value)}
          />
          <Input
            label="들여쓰기 (em)"
            type="number"
            step="0.5"
            value={config.textIndent}
            onChange={(e) => updateConfig('textIndent', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="좌우 여백 (px)"
            type="number"
            value={config.horizontalPadding}
            onChange={(e) => updateConfig('horizontalPadding', e.target.value)}
          />
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              원문 투명도 ({config.originalOpacity}%)
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={config.originalOpacity}
              onChange={(e) => updateConfig('originalOpacity', e.target.value)}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>숨김</span>
              <span>반투명</span>
              <span>표시</span>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-700 pt-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.showOriginal}
              onChange={(e) => updateConfig('showOriginal', e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span className="text-sm text-slate-300">원문 표시</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.forceDialogueBreak}
              onChange={(e) => updateConfig('forceDialogueBreak', e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            <span className="text-sm text-slate-300">대사 강제 개행</span>
          </label>
        </div>

        <div className="border-t border-slate-700 pt-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">미리보기</h3>
          <div
            className="p-4 rounded-lg border border-slate-600 min-h-[120px]"
            style={{
              fontFamily: config.fontFamily,
              fontSize: `${config.fontSize}px`,
              fontWeight: config.fontWeight,
              lineHeight: config.lineHeight,
              color: config.textColor,
              backgroundColor: config.backgroundColor,
              padding: `16px ${config.horizontalPadding}px`,
            }}
          >
            {config.showOriginal && (
              <p
                className="mb-2"
                style={{
                  opacity: Number(config.originalOpacity) / 100,
                  marginBottom: `${config.paragraphSpacing}px`,
                  textIndent: `${config.textIndent}em`,
                }}
              >
                これは日本語の原文テキストです。
              </p>
            )}
            <p style={{ textIndent: `${config.textIndent}em` }}>
              이것은 한국어 번역 텍스트입니다.
            </p>
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="secondary" onClick={handleReset}>
            기본값 복원
          </Button>
          <Button onClick={handleSave} isLoading={isLoading}>
            설정 저장
          </Button>
        </div>
      </div>
    </div>
  );
};
