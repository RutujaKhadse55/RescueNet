import { create } from 'zustand';
import { Language } from '../i18n/translations';

interface SettingsState {
  language: Language;
  highContrast: boolean;
  largeType: boolean;
  soundEnabled: boolean;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  toggleHighContrast: () => void;
  toggleLargeType: () => void;
  toggleSound: () => void;
}

const STORAGE_KEY = 'rescuenet_dashboard_settings';

function loadInitialSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // fallback
  }
  return {
    language: 'en' as Language,
    highContrast: false,
    largeType: false,
    soundEnabled: true,
  };
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const initial = loadInitialSettings();

  const persist = (partial: Partial<SettingsState>) => {
    try {
      const current = {
        language: get().language,
        highContrast: get().highContrast,
        largeType: get().largeType,
        soundEnabled: get().soundEnabled,
        ...partial,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // storage unavailable
    }
  };

  return {
    language: initial.language,
    highContrast: initial.highContrast,
    largeType: initial.largeType,
    soundEnabled: initial.soundEnabled,

    setLanguage: (lang) => {
      set({ language: lang });
      persist({ language: lang });
    },

    toggleLanguage: () => {
      const next = get().language === 'en' ? 'hi' : 'en';
      set({ language: next });
      persist({ language: next });
    },

    toggleHighContrast: () => {
      const next = !get().highContrast;
      set({ highContrast: next });
      persist({ highContrast: next });
      if (typeof document !== 'undefined') {
        if (next) {
          document.documentElement.classList.add('high-contrast');
        } else {
          document.documentElement.classList.remove('high-contrast');
        }
      }
    },

    toggleLargeType: () => {
      const next = !get().largeType;
      set({ largeType: next });
      persist({ largeType: next });
      if (typeof document !== 'undefined') {
        if (next) {
          document.documentElement.classList.add('large-type');
        } else {
          document.documentElement.classList.remove('large-type');
        }
      }
    },

    toggleSound: () => {
      const next = !get().soundEnabled;
      set({ soundEnabled: next });
      persist({ soundEnabled: next });
    },
  };
});
