import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUIStore } from '../stores/uiStore';

export type DisplayLayout = 'sideBySide' | 'stacked';

export interface ViewConfig {
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

export function useViewSettings() {
  const [config, setConfig] = useState<ViewConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const viewConfigVersion = useUIStore((state) => state.viewConfigVersion);

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
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, [viewConfigVersion]);

  const getStyles = () => ({
    container: {
      fontFamily: config.fontFamily,
      fontSize: `${config.fontSize}px`,
      fontWeight: config.fontWeight,
      lineHeight: config.lineHeight,
      color: config.textColor,
      backgroundColor: config.backgroundColor,
      padding: `16px ${config.horizontalPadding}px`,
    },
    original: {
      opacity: Number(config.originalOpacity) / 100,
      marginBottom: `${config.paragraphSpacing}px`,
      textIndent: `${config.textIndent}em`,
      display: config.showOriginal ? 'block' : 'none',
    },
    translated: {
      textIndent: `${config.textIndent}em`,
      marginBottom: `${config.paragraphSpacing}px`,
    },
    paragraph: {
      marginBottom: `${config.paragraphSpacing}px`,
    },
  });

  return { config, isLoading, getStyles };
}
