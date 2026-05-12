import { Injectable, signal, computed } from '@angular/core';
import { PocketBaseService } from './pocketbase.service';
import { User } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);
  readonly loading = signal(false);
  readonly isAuthenticated = computed(() => !!this.user());
  readonly isAdmin = computed(() => this.user()?.role === 'admin');

  private get pb() { return this.pbService.pb; }

  constructor(private pbService: PocketBaseService) {}

  async init(): Promise<void> {
    if (this.pb.authStore.isValid) {
      try {
        await this.pb.collection('users').authRefresh();
        this.user.set(this.pb.authStore.record as unknown as User);
      } catch {
        this.pb.authStore.clear();
      }
    }
  }

  async login(email: string, password: string): Promise<void> {
    await this.pb.collection('users').authWithPassword(email, password);
    this.user.set(this.pb.authStore.record as unknown as User);
  }

  async register(email: string, password: string, passwordConfirm: string, firstName: string, lastName: string): Promise<void> {
    await this.pb.collection('users').create({ email, password, passwordConfirm, first_name: firstName, last_name: lastName });
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
