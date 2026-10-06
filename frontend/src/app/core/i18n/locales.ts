/**
 * Supported UI languages.
 *
 * The app is built once with English (`en`) baked in as the source locale.
 * Other locales are applied at runtime via `@angular/localize`'s
 * `loadTranslations()` (see `main.ts`) from the JSON bundles in
 * `public/i18n/<lang>.json`, so switching language only needs a page reload —
 * no per-locale builds.
 */
export type AppLanguage = 'en' | 'it' | 'es' | 'fr';

export const DEFAULT_LANGUAGE: AppLanguage = 'en';

export interface LanguageOption {
  code: AppLanguage;
  /** Native, self-describing label shown in the language picker. */
  label: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
] as const;

/** localStorage key holding the locale to load at boot (read by main.ts). */
export const LANGUAGE_STORAGE_KEY = 'sv-lang';

export function isAppLanguage(value: unknown): value is AppLanguage {
  return SUPPORTED_LANGUAGES.some((l) => l.code === value);
}

/**
 * Resolve the language to use at boot, in priority order:
 *  1. a `?lang=` query-string override (also persisted for subsequent loads),
 *  2. the explicit stored choice,
 *  3. the browser preference if it maps to a supported locale,
 *  4. the default.
 */
export function resolveBootLanguage(): AppLanguage {
  try {
    const queryLang = new URLSearchParams(window.location.search).get('lang');
    if (isAppLanguage(queryLang)) {
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, queryLang);
      } catch {
        /* storage unavailable — still honour the override for this load */
      }
      return queryLang;
    }
  } catch {
    /* no window/search available — fall through */
  }

  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isAppLanguage(stored)) {
      return stored;
    }
  } catch {
    /* storage unavailable (private mode) — fall through to browser/default */
  }

  const navLang = (navigator.language || '').slice(0, 2).toLowerCase();
  return isAppLanguage(navLang) ? navLang : DEFAULT_LANGUAGE;
}
