import type { TabType } from '../types';

type NavigatorPlatformInfo = Pick<Navigator, 'platform' | 'userAgent'> & {
  userAgentData?: {
    platform?: string;
  };
};

export const MAIN_TAB_SHORTCUTS: Record<TabType, string> = {
  translation: '1',
  series: '2',
  settings: '3',
};

export const FOCUS_TRANSLATION_URL_INPUT_EVENT = 'focus-translation-url-input';

export function isApplePlatform(
  nav: NavigatorPlatformInfo | undefined = typeof navigator === 'undefined'
    ? undefined
    : (navigator as NavigatorPlatformInfo),
): boolean {
  if (!nav) {
    return false;
  }

  const platform = nav.userAgentData?.platform ?? nav.platform ?? nav.userAgent;
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function getShortcutModifierLabel(nav?: NavigatorPlatformInfo): 'Cmd' | 'Ctrl' {
  return isApplePlatform(nav) ? 'Cmd' : 'Ctrl';
}

export function getMainTabShortcutLabel(tab: TabType, nav?: NavigatorPlatformInfo): string {
  return `${getShortcutModifierLabel(nav)}+${MAIN_TAB_SHORTCUTS[tab]}`;
}

export function getMainTabForShortcut(key: string): TabType | null {
  const matchedTab = (Object.entries(MAIN_TAB_SHORTCUTS) as [TabType, string][])
    .find(([, shortcut]) => shortcut === key);

  return matchedTab?.[0] ?? null;
}
