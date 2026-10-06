export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  plan: string;
  role: string;
  verified: boolean;
  [key: string]: unknown;
}

/**
 * Per-user configuration stored in the `users_config` PocketBase collection:
 * UI language, colour scheme and the dashboard layout preferences.
 */
export interface UserConfig {
  id: string;
  user: string;
  language: string;
  theme: '' | 'light' | 'dark';
  dashboard_config: DashboardConfig | null;
  metadata: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/** User-editable dashboard layout. Kept intentionally open for future widgets. */
export interface DashboardConfig {
  /** Ordered list of metric/widget keys the user has chosen to show. */
  widgets?: string[];
  /** Hidden widget keys, when the user opts a card out. */
  hiddenWidgets?: string[];
  [key: string]: unknown;
}
