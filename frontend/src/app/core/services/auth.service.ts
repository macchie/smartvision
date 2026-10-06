import { Injectable, signal, computed } from '@angular/core';
import { PocketBaseService } from './pocketbase.service';
import { User } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);
  readonly loading = signal(false);
  readonly isAuthenticated = computed(() => !!this.user());
  readonly isAdmin = computed(() => this.user()?.role === 'admin');
  readonly isOperator = computed(() => this.user()?.role === 'operator');
  readonly canAccessConsole = computed(() => this.isAdmin() || this.isOperator());

  private get pb() { return this.pbService.pb; }

  constructor(private pbService: PocketBaseService) {}

  async init(): Promise<void> {
    if (!this.pb.authStore.isValid) {
      return;
    }

    // Optimistically trust the cached record so a slow/unreachable backend
    // can't block app bootstrap (the splash would otherwise hang forever).
    this.user.set(this.pb.authStore.record as unknown as User);

    try {
      await this.withTimeout(this.pb.collection('users').authRefresh(), 8000);
      this.user.set(this.pb.authStore.record as unknown as User);
    } catch (error) {
      // Only drop the session for an explicit auth failure, not for a timeout
      // or offline backend — those keep the cached session until next refresh.
      if (this.isAuthRejection(error)) {
        this.pb.authStore.clear();
        this.user.set(null);
      }
    }
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('auth-refresh-timeout')), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private isAuthRejection(error: unknown): boolean {
    const status = (error as { status?: number })?.status;
    return status === 401 || status === 403;
  }

  async login(email: string, password: string): Promise<void> {
    await this.pb.collection('users').authWithPassword(email, password);
    const record = this.pb.authStore.record as unknown as User;

    if (record?.role !== 'admin' && record?.role !== 'operator') {
      this.pb.authStore.clear();
      this.user.set(null);
      throw new Error('Only admin and operator accounts can access SmartVision.');
    }

    this.user.set(record);
  }

  async updateProfile(data: { first_name: string; last_name: string; plan?: string }): Promise<void> {
    const userId = this.user()?.id;
    if (!userId) return;
    await this.pb.collection('users').update(userId, data);
    await this.pb.collection('users').authRefresh();
    this.user.set(this.pb.authStore.record as unknown as User);
  }

  logout(): void {
    this.pb.authStore.clear();
    this.user.set(null);
  }

  get userDisplayName(): string {
    const u = this.user();
    if (!u) return '';
    const name = ((u.first_name || '') + ' ' + (u.last_name || '')).trim();
    return name || u.email;
  }

  get userInitials(): string {
    const u = this.user();
    if (!u) return '?';
    const f = u.first_name?.[0] || '';
    const l = u.last_name?.[0] || '';
    return (f + l).toUpperCase() || u.email?.[0]?.toUpperCase() || '?';
  }
}
