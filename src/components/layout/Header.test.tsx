import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';
import { useDebugStore } from '../../stores/debugStore';
import { useSeriesStore } from '../../stores/seriesStore';
import { useTranslationStore } from '../../stores/translationStore';
import { useUIStore } from '../../stores/uiStore';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async () => null),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

describe('Header', () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalPlatform = window.navigator.platform;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useUIStore.setState({
      currentTab: 'translation',
      theme: 'dark',
      language: 'ko',
    });
    useDebugStore.setState({ debugMode: false });
    useSeriesStore.setState({
      batchProgress: null,
      watchlistBadgeCount: 0,
    });
    useTranslationStore.setState({ isTranslating: false });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: originalPlatform,
    });
    vi.clearAllMocks();
  });

  it('shows a visible shortcut tooltip on hover for macOS', async () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'MacIntel',
    });

    await act(async () => {
      root.render(<Header />);
    });

    const translationTab = container.querySelector('#tab-translation');
    expect(translationTab).toBeTruthy();

    act(() => {
      translationTab?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    expect(container.textContent).toContain('번역 (Cmd+1)');
  });

  it('shows a visible shortcut tooltip on hover for Windows and Linux', async () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    });

    await act(async () => {
      root.render(<Header />);
    });

    const translationTab = container.querySelector('#tab-translation');
    expect(translationTab).toBeTruthy();

    act(() => {
      translationTab?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    expect(container.textContent).toContain('번역 (Ctrl+1)');
  });

  it.each([
    {
      language: 'ko' as const,
      tabLabels: ['번역', '관심작품', '설정'],
      mainTabsLabel: '메인 탭',
      lightModeLabel: '라이트 모드로 전환',
      darkModeLabel: '다크 모드로 전환',
      otherLightModeLabel: 'Switch to light mode',
      otherDarkModeLabel: 'Switch to dark mode',
      languageSelectorLabel: '언어 선택',
      selectedLanguageLabel: '한국어',
      otherLanguageLabel: '영어',
      otherMainTabsLabel: 'Main tabs',
    },
    {
      language: 'en' as const,
      tabLabels: ['Translation', 'Watchlist', 'Settings'],
      mainTabsLabel: 'Main tabs',
      lightModeLabel: 'Switch to light mode',
      darkModeLabel: 'Switch to dark mode',
      otherLightModeLabel: '라이트 모드로 전환',
      otherDarkModeLabel: '다크 모드로 전환',
      languageSelectorLabel: 'Language',
      selectedLanguageLabel: 'English',
      otherLanguageLabel: 'Korean',
      otherMainTabsLabel: '메인 탭',
    },
  ])('renders labels and selected language state in $language', async ({
    language,
    tabLabels,
    mainTabsLabel,
    lightModeLabel,
    darkModeLabel,
    otherLightModeLabel,
    otherDarkModeLabel,
    languageSelectorLabel,
    selectedLanguageLabel,
    otherLanguageLabel,
    otherMainTabsLabel,
  }) => {
    useUIStore.setState({ language });

    await act(async () => {
      root.render(<Header />);
    });

    tabLabels.forEach((tabLabel) => {
      expect(container.textContent).toContain(tabLabel);
    });
    expect(container.querySelector(`nav[aria-label="${mainTabsLabel}"]`)).toBeTruthy();
    expect(container.querySelector(`nav[aria-label="${otherMainTabsLabel}"]`)).toBeFalsy();
    expect(container.querySelector(`button[aria-label="${lightModeLabel}"]`)).toBeTruthy();
    expect(container.querySelector(`button[aria-label="${otherLightModeLabel}"]`)).toBeFalsy();
    expect(
      container.querySelector(`button[aria-label="${selectedLanguageLabel}"]`)?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      container.querySelector(`button[aria-label="${otherLanguageLabel}"]`)?.getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      container.querySelector(`[role="group"][aria-label="${languageSelectorLabel}"]`),
    ).toBeTruthy();

    act(() => {
      useUIStore.setState({ theme: 'light' });
    });

    expect(container.querySelector(`button[aria-label="${darkModeLabel}"]`)).toBeTruthy();
    expect(container.querySelector(`button[aria-label="${lightModeLabel}"]`)).toBeFalsy();
    expect(container.querySelector(`button[aria-label="${otherDarkModeLabel}"]`)).toBeFalsy();
  });

  it('persists the selected language when switching from Korean to English', async () => {
    await act(async () => {
      root.render(<Header />);
    });

    const englishButton = Array.from(container.querySelectorAll('button')).find(
      (element) => element.textContent?.trim() === 'EN',
    );

    expect(englishButton).toBeTruthy();

    await act(async () => {
      englishButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useUIStore.getState().language).toBe('en');
    expect(invokeMock).toHaveBeenCalledWith('set_setting', {
      key: 'ui_language',
      value: 'en',
    });
    expect(container.textContent).toContain('Translation');
  });
});
