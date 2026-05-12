import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { Menu, MenuModule } from 'primeng/menu';
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
  imports: [CommonModule, AvatarModule, ButtonModule, CardModule, MenuModule, TableModule, TagModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly themeStorageKey = 'smartvision-theme';
  @ViewChild('userMenu') private userMenu?: Menu;

  protected readonly loading = signal(true);
  protected readonly refreshing = signal(false);
  protected readonly loadError = signal('');

  protected readonly latestCameraEvents = signal<AccessRow[]>([]);
  protected readonly vehiclesInside = signal(0);
  protected readonly usersInside = signal(0);
  protected readonly keyDistributed = signal(0);
  protected readonly lastUpdatedAt = signal('');
  protected readonly isDarkMode = signal(false);

  protected readonly vehicleRows = computed(() =>
    this.latestCameraEvents().filter(row => row.accessType === 'vehicle').slice(0, 8),
  );

  protected readonly userRows = computed(() =>
    this.latestCameraEvents().filter(row => row.accessType === 'user').slice(0, 8),
  );

  protected readonly cameraVehicleCards = computed(() => {
    const latestByCamera = new Map<string, AccessRow>();
    for (const row of this.latestCameraEvents()) {
      if (row.accessType !== 'vehicle') {
        continue;
      }

      if (!latestByCamera.has(row.camera)) {
        latestByCamera.set(row.camera, row);
      }
    }

    return Array.from(latestByCamera.values());
  });

  protected readonly userMenuItems = computed<MenuItem[]>(() => [
    {
      label: this.isDarkMode() ? 'Switch to Light Mode' : 'Switch to Dark Mode',
      icon: this.isDarkMode() ? 'pi pi-sun' : 'pi pi-moon',
      command: () => this.toggleThemeMode(),
    },
    {
      separator: true,
    },
    {
      label: 'Sign Out',
      icon: 'pi pi-sign-out',
      command: () => this.signOut(),
    },
  ]);

  private refreshHandle: ReturnType<typeof setInterval> | null = null;
  private systemThemeMedia: MediaQueryList | null = null;
  private systemThemeListener: ((event: MediaQueryListEvent) => void) | null = null;

  constructor(
    public authService: AuthService,
    private router: Router,
    private pocketBaseService: PocketBaseService,
  ) {}

  ngOnInit(): void {
    this.initializeThemeMode();
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

    if (this.systemThemeMedia && this.systemThemeListener) {
      this.systemThemeMedia.removeEventListener('change', this.systemThemeListener);
      this.systemThemeListener = null;
    }
  }

  protected refreshDashboard(): void {
    this.loadDashboard(false);
  }

  protected signOut(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  protected toggleUserMenu(event: Event): void {
    this.userMenu?.toggle(event);
  }

  protected quickAction(action: 'vehicle_access' | 'user_access' | 'key_distribute' | 'key_collect'): void {
    alert(`Quick action [${action}] is under construction.`);
  }

  protected toggleThemeMode(): void {
    const nextMode = this.isDarkMode() ? 'light' : 'dark';
    this.applyThemeMode(nextMode, true);
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

  private initializeThemeMode(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const savedTheme = window.localStorage.getItem(this.themeStorageKey);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      this.applyThemeMode(savedTheme, false);
      return;
    }

    this.systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
    this.applyThemeMode(this.systemThemeMedia.matches ? 'dark' : 'light', false);

    this.systemThemeListener = (event: MediaQueryListEvent) => {
      if (!window.localStorage.getItem(this.themeStorageKey)) {
        this.applyThemeMode(event.matches ? 'dark' : 'light', false);
      }
    };

    this.systemThemeMedia.addEventListener('change', this.systemThemeListener);
  }

  private applyThemeMode(mode: 'light' | 'dark', persist: boolean): void {
    this.isDarkMode.set(mode === 'dark');

    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('app-dark', mode === 'dark');
    }

    if (persist && typeof window !== 'undefined') {
      window.localStorage.setItem(this.themeStorageKey, mode);
      if (this.systemThemeMedia && this.systemThemeListener) {
        this.systemThemeMedia.removeEventListener('change', this.systemThemeListener);
        this.systemThemeListener = null;
      }
    }
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
