import { getMessages } from '../../i18n';
import { useUIStore } from '../../stores/uiStore';

export const useSettingsMessages = () => {
  const language = useUIStore((state) => state.language);
  return getMessages(language).settings;
};
