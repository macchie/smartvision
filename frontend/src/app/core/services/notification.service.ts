import { Injectable, signal } from '@angular/core';

export interface Notification {
  message: string;
  type: 'success' | 'error' | 'info';
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly notification = signal<Notification | null>(null);
  private timeout: ReturnType<typeof setTimeout> | null = null;

  notify(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.notification.set({ message, type });
    this.timeout = setTimeout(() => this.notification.set(null), 3000);
  }
}
