import { commonMessages } from './ko/common';
import { settingsMessages } from './ko/settings';
import { seriesMessages } from './ko/series';
import { translationMessages } from './ko/translation';

export const messages = {
  common: commonMessages,
  settings: settingsMessages,
  series: seriesMessages,
  translation: translationMessages,
} as const;
