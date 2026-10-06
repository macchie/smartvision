import { Injectable, signal, inject } from '@angular/core';
import { PocketBaseService } from './pocketbase.service';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import { LocaleService } from './locale.service';
import { AppLanguage, isAppLanguage } from '../i18n/locales';
import { DashboardConfig, UserConfig } from '../models';

/**
 * Loads and persists the signed-in user's `users_config` record and keeps the
 * device-level preferences (language via {@link LocaleService}, colour scheme
 * via {@link ThemeService}) in sync with it.
 */
@Injectable({ providedIn: 'root' })
export class UserConfigService {
  private readonly pbService = inject(PocketBaseService);
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly locale = inject(LocaleService);

  readonly config = signal<UserConfig | null>(null);
  readonly loading = signal(false);

  private get pb() {
    return this.pbService.pb;
  }

  /**
   * Fetch (or lazily create) the current user's config and apply its stored
   * preferences. Called during app init once authentication is known.
   *
   * If the stored language differs from the one this device booted with, the
   * page is reloaded so `@angular/localize` picks up the right bundle.
   */
  async load(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      this.config.set(null);
      return;
    }

    this.loading.set(true);
    try {
      const record = await this.fetchOrCreate(userId);
      this.config.set(record);
      this.applyPreferences(record);
    } catch (error) {
      // A missing config must never block the app — fall back to defaults.
      console.error('[user-config] failed to load configuration', error);
    } finally {
      this.loading.set(false);
    }
  }

  async setLanguage(language: AppLanguage): Promise<void> {
    await this.patch({ language });
    // Persist + reload so translations for the new locale take effect.
    this.locale.apply(language);
  }

  async setTheme(theme: 'light' | 'dark'): Promise<void> {
    this.theme.setTheme(theme);
    await this.patch({ theme });
  }

  async setDashboardConfig(dashboard: DashboardConfig): Promise<void> {
    await this.patch({ dashboard_config: dashboard });
  }

  dashboardConfig(): DashboardConfig | null {
    return this.config()?.dashboard_config ?? null;
  }

  private applyPreferences(record: UserConfig): void {
    if (record.theme === 'light' || record.theme === 'dark') {
      this.theme.setTheme(record.theme);
    }

    if (isAppLanguage(record.language)) {
      // Returns true only when the active locale actually differs; reloading
      // then re-boots with the correct translation bundle (no reload loop
      // because localStorage now matches).
      if (this.locale.persist(record.language)) {
        window.location.reload();
      }
    }
  }

  private async fetchOrCreate(userId: string): Promise<UserConfig> {
    try {
      return await this.pb
        .collection('users_config')
        .getFirstListItem<UserConfig>(this.pb.filter('user = {:user}', { user: userId }));
    } catch (error) {
      if ((error as { status?: number })?.status === 404) {
        return await this.pb.collection('users_config').create<UserConfig>({
          user: userId,
          language: this.locale.current(),
          theme: this.theme.theme(),
        });
      }
      throw error;
    }
  }

  private async patch(data: Partial<UserConfig>): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;

    const existing = this.config() ?? (await this.fetchOrCreate(userId));
    const updated = await this.pb
      .collection('users_config')
      .update<UserConfig>(existing.id, data);
    this.config.set(updated);
  }
}
