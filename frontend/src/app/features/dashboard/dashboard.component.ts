import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../../core/services/auth.service';
import { PocketBaseService } from '../../core/services/pocketbase.service';

type AccessType = 'vehicle' | 'user';

type AccessRow = {
  id: string;
  accessType: AccessType;
  subject: string;
  actor: string;
  camera: string;
  direction: 'in' | 'out';
  didLeave: boolean;
  reason: string;
  eventTime: string;
  createdAt: string;
};

type DashboardSummaryResponse = {
  metrics: {
    vehiclesInside: number;
    usersInside: number;
    keyDistributed: number;
  };
  events: Array<{
    id: string;
    accessType: AccessType;
    subject: string;
    actor: string;
    camera: string;
    direction: 'in' | 'out';
    didLeave: boolean;
    reason: string;
    createdAt: string;
  }>;
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ButtonModule, CardModule, TableModule, TagModule],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit, OnDestroy {
  protected readonly loading = signal(true);
  protected readonly refreshing = signal(false);
  protected readonly loadError = signal('');

  protected readonly latestCameraEvents = signal<AccessRow[]>([]);
  protected readonly vehiclesInside = signal(0);
  protected readonly usersInside = signal(0);
  protected readonly keyDistributed = signal(0);
  protected readonly lastUpdatedAt = signal('');

  protected readonly vehicleRows = computed(() =>
    this.latestCameraEvents().filter(row => row.accessType === 'vehicle').slice(0, 8),
  );

  protected readonly userRows = computed(() =>
    this.latestCameraEvents().filter(row => row.accessType === 'user').slice(0, 8),
  );

  private refreshHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    public authService: AuthService,
    private router: Router,
    private pocketBaseService: PocketBaseService,
  ) {}

  ngOnInit(): void {
    this.loadDashboard(true);
    this.refreshHandle = setInterval(() => {
      this.loadDashboard(false);
    }, 20000);
  }

  ngOnDestroy(): void {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
      this.refreshHandle = null;
    }
  }

  protected refreshDashboard(): void {
    this.loadDashboard(false);
  }

  protected signOut(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  protected directionSeverity(direction: 'in' | 'out'): 'success' | 'danger' {
    return direction === 'in' ? 'success' : 'danger';
  }

  protected leaveSeverity(left: boolean): 'success' | 'warn' {
    return left ? 'success' : 'warn';
  }

  protected accessTypeSeverity(type: AccessType): 'info' | 'contrast' {
    return type === 'vehicle' ? 'contrast' : 'info';
  }

  private get pb() {
    return this.pocketBaseService.pb;
  }

  private async loadDashboard(initialLoad: boolean): Promise<void> {
    if (initialLoad) {
      this.loading.set(true);
    } else {
      this.refreshing.set(true);
    }

    try {
      const summary = await this.fetchDashboardSummary();
      const events = summary.events.map(event => ({
        ...event,
        eventTime: this.formatRelativeTime(event.createdAt),
      }));

      this.latestCameraEvents.set(events);
      this.vehiclesInside.set(summary.metrics.vehiclesInside);
      this.usersInside.set(summary.metrics.usersInside);
      this.keyDistributed.set(summary.metrics.keyDistributed);
      this.lastUpdatedAt.set(new Date().toLocaleString());
      this.loadError.set('');
    } catch (error) {
      console.error('Dashboard data load failed', error);
      this.loadError.set('Unable to load the latest access data from PocketBase.');
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
    }
  }

  private async fetchDashboardSummary(): Promise<DashboardSummaryResponse> {
    return this.pb.send('/api/dashboard/summary', {
      method: 'GET',
      query: {
        eventsLimit: 50,
      },
      requestKey: null,
    }) as Promise<DashboardSummaryResponse>;
  }

  private formatRelativeTime(isoDate: string): string {
    if (!isoDate) {
      return '-';
    }

    const then = new Date(isoDate).getTime();
    if (!Number.isFinite(then)) {
      return '-';
    }

    const now = Date.now();
    const diffMs = then - now;
    const diffSec = Math.round(diffMs / 1000);

    if (!Number.isFinite(diffSec)) {
      return '-';
    }

    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

    if (Math.abs(diffSec) < 60) {
      return rtf.format(diffSec, 'second');
    }

    const diffMin = Math.round(diffSec / 60);
    if (Math.abs(diffMin) < 60) {
      return rtf.format(diffMin, 'minute');
    }

    const diffHour = Math.round(diffMin / 60);
    if (Math.abs(diffHour) < 24) {
      return rtf.format(diffHour, 'hour');
    }

    const diffDay = Math.round(diffHour / 24);
    return rtf.format(diffDay, 'day');
  }
}
