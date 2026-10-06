import { Injectable, signal } from '@angular/core';
import {
  AppLanguage,
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  isAppLanguage,
  resolveBootLanguage,
} from '../i18n/locales';

/**
 * Tracks the active UI language and persists the user's choice.
 *
 * Translations are loaded once at boot (see `main.ts`), so changing the
 * language here stores the new choice and triggers a reload to re-bootstrap
 * with the correct `@angular/localize` bundle. The stored value in
 * localStorage is the single source of truth consumed at boot; the backend
 * `users_config` record is synced to it by `UserConfigService`.
 */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  /** The locale the app is currently running under (set at boot). */
  readonly language = signal<AppLanguage>(resolveBootLanguage());

  /** The locale baked into the current bundle; `en` unless overridden at boot. */
  current(): AppLanguage {
    return this.language();
  }

  /**
   * Persist `lang` as the preferred locale. Returns `true` when the active
   * locale actually changed and a reload is required to apply it.
   */
  persist(lang: AppLanguage): boolean {
    const normalized = isAppLanguage(lang) ? lang : DEFAULT_LANGUAGE;
    const changed = normalized !== this.current();
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
    } catch {
      /* storage unavailable — the in-memory signal still reflects the choice */
    }
    this.language.set(normalized);
    return changed;
  }

  /** Persist the language and, if it changed, reload to apply translations. */
  apply(lang: AppLanguage): void {
    if (this.persist(lang)) {
      window.location.reload();
    }
  }
}
