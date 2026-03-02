import { useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { NumberStepper } from '../common/NumberStepper';
import { Toggle } from '../common/Toggle';
import { useUIStore } from '../../stores/uiStore';

type DisplayLayout = 'sideBySide' | 'stacked';

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
  displayLayout: DisplayLayout;
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
  displayLayout: 'sideBySide',
};

const LAYOUT_OPTIONS: { value: DisplayLayout; label: string; description: string }[] = [
  { value: 'sideBySide', label: '좌우 배치', description: '원문과 번역을 나란히 표시' },
  { value: 'stacked', label: '상하 배치', description: '원문 아래에 번역을 표시' },
];

const COLOR_PRESETS = [
  { name: '다크 (기본)', text: '#ffffff', bg: '#0f172a' },
  { name: '세피아', text: '#5c4b37', bg: '#f4ecd8' },
  { name: '라이트', text: '#1f2937', bg: '#f9fafb' },
  { name: '다크 그린', text: '#e2e8f0', bg: '#1a2e1a' },
  { name: '아몰레드', text: '#e5e5e5', bg: '#000000' },
];

export const ViewSettings = forwardRef((_, ref) => {
  const [config, setConfig] = useState<ViewConfig>(DEFAULT_CONFIG);
  const bumpViewConfigVersion = useUIStore((state) => state.bumpViewConfigVersion);
  const isDark = useUIStore((state) => state.theme) === 'dark';

  const handleSave = async () => {
    try {
      await invoke('set_setting', { key: 'view_config', value: JSON.stringify(config) });
      bumpViewConfigVersion();
    } catch (error) {
      console.error('Failed to save view settings:', error);
    }
  };

  useImperativeHandle(ref, () => ({
    save: handleSave
  }));

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

  const handleReset = async () => {
    const confirmed = await ask('기본 설정으로 초기화하시겠습니까?', {
      title: '설정 초기화',
      kind: 'warning',
    });
    if (confirmed) {
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
      <div className={`border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>보기 설정</h2>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>번역 결과의 표시 방식을 설정합니다.</p>
      </div>

      <div className={`p-6 rounded-xl border space-y-6 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div>
          <h3 className={`text-sm font-medium mb-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>미리보기</h3>
          <div
            className={`p-4 rounded-lg border min-h-[120px] ${isDark ? 'border-slate-600' : 'border-slate-300'}`}
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
            {config.showOriginal && config.displayLayout === 'sideBySide' ? (
              <div className="grid grid-cols-2 gap-4">
                <p
                  style={{
                    opacity: Number(config.originalOpacity) / 100,
                    textIndent: `${config.textIndent}em`,
                  }}
                >
                  これは日本語の原文テキストです。
                </p>
                <p style={{ textIndent: `${config.textIndent}em` }}>
                  이것은 한국어 번역 텍스트입니다.
                </p>
              </div>
            ) : (
              <>
                {config.showOriginal && (
                  <p
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
              </>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <Toggle
            label="원문 표시"
            checked={config.showOriginal}
            onChange={(checked) => updateConfig('showOriginal', checked)}
          />
          <Toggle
            label="대사 강제 개행"
            checked={config.forceDialogueBreak}
            onChange={(checked) => updateConfig('forceDialogueBreak', checked)}
          />
        </div>

        <div className={config.showOriginal ? '' : 'opacity-50 pointer-events-none'}>
          <h3 className={`text-sm font-medium mb-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>레이아웃</h3>
          <div className="flex gap-2">
            {LAYOUT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => updateConfig('displayLayout', option.value)}
                disabled={!config.showOriginal}
                className={`flex-1 p-3 rounded-lg border text-left transition-colors ${
                  config.displayLayout === option.value
                    ? 'border-blue-500 bg-blue-500/10'
                    : isDark ? 'border-slate-600 hover:border-slate-500' : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                <span className={`block text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{option.label}</span>
                <span className={`block text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{option.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className={`text-sm font-medium mb-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>색상 프리셋</h3>
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className={`px-3 py-1.5 rounded-lg text-sm border hover:border-blue-500 transition-colors flex items-center gap-2 ${isDark ? 'border-slate-600' : 'border-slate-300'}`}
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
            <NumberStepper
              label="글자 크기 (px)"
              value={parseInt(config.fontSize, 10) || 16}
              onChange={(value) => updateConfig('fontSize', String(value))}
              min={8}
              max={72}
              step={1}
              unit="px"
            />
            <NumberStepper
              label="글자 두께"
              value={parseInt(config.fontWeight, 10) || 400}
              onChange={(value) => updateConfig('fontWeight', String(value))}
              min={100}
              max={900}
              step={100}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>글자 색상</label>
            <div className="flex items-center gap-2">
              <div
                className={`w-10 h-10 rounded-lg border cursor-pointer relative overflow-hidden ${isDark ? 'border-slate-600' : 'border-slate-300'}`}
                style={{ backgroundColor: config.textColor }}
              >
                <input
                  type="color"
                  value={config.textColor}
                  onChange={(e) => updateConfig('textColor', e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <Input
                value={config.textColor}
                onChange={(e) => updateConfig('textColor', e.target.value)}
                className="flex-1 font-mono"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>배경 색상</label>
            <div className="flex items-center gap-2">
              <div
                className={`w-10 h-10 rounded-lg border cursor-pointer relative overflow-hidden ${isDark ? 'border-slate-600' : 'border-slate-300'}`}
                style={{ backgroundColor: config.backgroundColor }}
              >
                <input
                  type="color"
                  value={config.backgroundColor}
                  onChange={(e) => updateConfig('backgroundColor', e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
              <Input
                value={config.backgroundColor}
                onChange={(e) => updateConfig('backgroundColor', e.target.value)}
                className="flex-1 font-mono"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NumberStepper
            label="줄 간격"
            value={parseFloat(config.lineHeight) || 1.8}
            onChange={(value) => updateConfig('lineHeight', String(value))}
            min={1}
            max={4}
            step={0.1}
          />
          <NumberStepper
            label="문단 간격 (px)"
            value={Number.isNaN(parseInt(config.paragraphSpacing, 10)) ? 8 : parseInt(config.paragraphSpacing, 10)}
            onChange={(value) => updateConfig('paragraphSpacing', String(value))}
            min={0}
            max={64}
            step={2}
            unit="px"
          />
          <NumberStepper
            label="들여쓰기 (em)"
            value={parseFloat(config.textIndent) || 0}
            onChange={(value) => updateConfig('textIndent', String(value))}
            min={0}
            max={4}
            step={0.5}
            unit="em"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumberStepper
            label="좌우 여백 (px)"
            value={Number.isNaN(parseInt(config.horizontalPadding, 10)) ? 24 : parseInt(config.horizontalPadding, 10)}
            onChange={(value) => updateConfig('horizontalPadding', String(value))}
            min={0}
            max={120}
            step={4}
            unit="px"
          />
          <div>
            <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              원문 투명도 ({config.originalOpacity}%)
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={config.originalOpacity}
              onChange={(e) => updateConfig('originalOpacity', e.target.value)}
              className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-500 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}
            />
            <div className={`flex justify-between text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <span>숨김</span>
              <span>반투명</span>
              <span>표시</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={handleReset}>
            기본값 복원
          </Button>
        </div>
      </div>
    </div>
  );
});

ViewSettings.displayName = 'ViewSettings';
