// `@angular/localize/init` (loaded as a polyfill via angular.json) installs the
// global `$localize` used by i18n-marked templates before this entry point runs.
import { loadTranslations } from '@angular/localize';

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { DEFAULT_LANGUAGE, resolveBootLanguage } from './app/core/i18n/locales';

/**
 * Apply runtime translations before bootstrap.
 *
 * English is the source locale baked into the build, so it needs no bundle.
 * For any other supported locale we fetch its flat `{id: message}` map from
 * `/i18n/<lang>.json` and hand it to `loadTranslations()`. Switching language
 * elsewhere in the app persists the choice and reloads, re-running this step.
 */
async function applyRuntimeLocale(): Promise<void> {
  const lang = resolveBootLanguage();
  if (lang === DEFAULT_LANGUAGE) {
    return;
  }

  try {
    const response = await fetch(`i18n/${lang}.json`, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const bundle = (await response.json()) as { translations?: Record<string, string> };
    if (bundle.translations) {
      loadTranslations(bundle.translations);
      $localize.locale = lang;
    }
  } catch (error) {
    // Missing/broken bundle must not block boot — fall back to English source.
    console.error(`[i18n] failed to load translations for "${lang}"`, error);
  }
}

applyRuntimeLocale()
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err) => console.error(err));
