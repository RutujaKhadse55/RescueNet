import { useSettingsStore } from '../store/settingsStore';
import { translations, Translations, Language } from './translations';

export function useTranslation() {
  const language = useSettingsStore(s => s.language);
  const setLanguage = useSettingsStore(s => s.setLanguage);
  const toggleLanguage = useSettingsStore(s => s.toggleLanguage);

  const t: Translations = translations[language] || translations.en;

  return {
    t,
    language,
    setLanguage,
    toggleLanguage,
  };
}
