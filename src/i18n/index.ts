import { commonMessages } from './ko/common';
import { settingsMessages } from './ko/settings';
import { seriesMessages } from './ko/series';
import { translationMessages } from './ko/translation';
import { commonMessages as enCommonMessages } from './en/common';
import { settingsMessages as enSettingsMessages } from './en/settings';
import { seriesMessages as enSeriesMessages } from './en/series';
import { translationMessages as enTranslationMessages } from './en/translation';

export const messages = {
  common: commonMessages,
  settings: settingsMessages,
  series: seriesMessages,
  translation: translationMessages,
} as const;

const localeMessages = {
  ko: messages,
  en: {
    common: enCommonMessages,
    settings: enSettingsMessages,
    series: enSeriesMessages,
    translation: enTranslationMessages,
  },
} as const;

export type UILanguage = keyof typeof localeMessages;

export const getMessages = (language: UILanguage) => localeMessages[language];

export const isUILanguage = (value: string): value is UILanguage =>
  value === 'ko' || value === 'en';
