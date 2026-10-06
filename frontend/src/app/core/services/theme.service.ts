import { Injectable, signal } from '@angular/core';

export type AppTheme = 'light' | 'dark';

const STORAGE_KEY = 'sv-theme';
const DARK_CLASS = 'dark';

/**
 * Manages the light/dark colour scheme.
 *
 * The application always boots in light mode unless the user has explicitly
 * chosen dark mode before. The OS `prefers-color-scheme` is intentionally NOT
 * consulted, so the theme never changes on its own.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<AppTheme>('light');

  constructor() {
    this.apply(this.readStoredTheme());
  }

  isDark(): boolean {
    return this.theme() === 'dark';
  }

  toggle(): void {
    this.setTheme(this.isDark() ? 'light' : 'dark');
  }

  setTheme(theme: AppTheme): void {
    this.apply(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* storage may be unavailable (private mode) — theme still applies for the session */
    }
  }

  private readStoredTheme(): AppTheme {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  private apply(theme: AppTheme): void {
    this.theme.set(theme);

    const root = document.documentElement;
    root.classList.toggle(DARK_CLASS, theme === 'dark');
    root.style.colorScheme = theme;

    const themeColor = theme === 'dark' ? '#0b1120' : '#ffffff';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
  }
}
