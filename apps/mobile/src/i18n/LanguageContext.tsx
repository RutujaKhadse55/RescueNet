import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  translations,
  SupportedLanguage,
  SUPPORTED_LANGUAGES,
  LanguageOption,
} from './translations';

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, defaultText?: string) => string;
  languages: LanguageOption[];
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key: string, defaultText?: string) => defaultText ?? key,
  languages: SUPPORTED_LANGUAGES,
});

export const LanguageProvider: React.FC<{
  initialLanguage?: SupportedLanguage;
  onLanguageChange?: (lang: SupportedLanguage) => void;
  children: React.ReactNode;
}> = ({ initialLanguage = 'en', onLanguageChange, children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(initialLanguage);

  useEffect(() => {
    setLanguageState(initialLanguage);
  }, [initialLanguage]);

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    if (onLanguageChange) {
      onLanguageChange(lang);
    }
  };

  const t = (key: string, defaultText?: string): string => {
    const langDict = translations[language] || translations.en;
    if (langDict && langDict[key]) {
      return langDict[key];
    }
    // Fallback to English if translation key missing in target language
    const enDict = translations.en;
    if (enDict && enDict[key]) {
      return enDict[key];
    }
    return defaultText ?? key;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        languages: SUPPORTED_LANGUAGES,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => useContext(LanguageContext);
