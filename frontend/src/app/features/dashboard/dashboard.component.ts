import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MenuItem, MessageService } from 'primeng/api';
import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { Menu, MenuModule } from 'primeng/menu';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
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
  imports: [
    CommonModule, FormsModule, AvatarModule, ButtonModule, CardModule, 
    MenuModule, TableModule, TagModule, DialogModule, AutoCompleteModule, 
    SelectModule, InputTextModule, TextareaModule, ToastModule
  ],
  providers: [MessageService],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  @ViewChild('userMenu') private userMenu?: Menu;

  protected readonly loading = signal(true);
  protected readonly refreshing = signal(false);
  protected readonly loadError = signal('');

  protected readonly latestCameraEvents = signal<AccessRow[]>([]);
  protected readonly vehiclesInside = signal(0);
  protected readonly usersInside = signal(0);
  protected readonly keyDistributed = signal(0);
  protected readonly lastUpdatedAt = signal('');
  protected readonly relativeTimeNow = signal(Date.now());

  protected readonly vehicleRows = computed(() => {
    this.relativeTimeNow();

    return this.latestCameraEvents()
      .filter(row => row.accessType === 'vehicle')
      .sort((a, b) => this.toTimestamp(b.createdAt) - this.toTimestamp(a.createdAt))
      .slice(0, 8)
      .map(row => ({
        ...row,
        eventTime: this.formatRelativeTime(row.createdAt),
      }));
  });

  protected readonly userRows = computed(() => {
    this.relativeTimeNow();

    return this.latestCameraEvents()
      .filter(row => row.accessType === 'user')
      .sort((a, b) => this.toTimestamp(b.createdAt) - this.toTimestamp(a.createdAt))
      .slice(0, 8)
      .map(row => ({
        ...row,
        eventTime: this.formatRelativeTime(row.createdAt),
      }));
  });

  protected readonly cameraVehicleCards = computed(() => {
    this.relativeTimeNow();

    const latestByCamera = new Map<string, AccessRow>();
    const sortedVehicleRows = this.latestCameraEvents()
      .filter(row => row.accessType === 'vehicle')
      .sort((a, b) => this.toTimestamp(b.createdAt) - this.toTimestamp(a.createdAt));

    for (const row of sortedVehicleRows) {
      if (row.accessType !== 'vehicle') {
        continue;
      }

      if (!latestByCamera.has(row.camera)) {
        latestByCamera.set(row.camera, {
          ...row,
          eventTime: this.formatRelativeTime(row.createdAt),
        });
      }
    }

    return Array.from(latestByCamera.values());
  });

  protected readonly userMenuItems = computed<MenuItem[]>(() => [
    {
      label: 'Sign Out',
      icon: 'pi pi-sign-out',
      command: () => this.signOut(),
    },
  ]);

  // Dialog Visibilities
  protected vehicleAccessDialog = signal(false);
  protected userAccessDialog = signal(false);
  protected keyDistributeDialog = signal(false);
  protected keyCollectDialog = signal(false);

  // Autocomplete Suggestions
  protected suggestedUsers = signal<any[]>([]);
  protected suggestedDrivers = signal<any[]>([]);
  protected suggestedVehicles = signal<any[]>([]);
  protected suggestedCameras = signal<any[]>([]);
  protected suggestedRooms = signal<any[]>([]);

  // Direction Options
  protected directionOptions = [
    { label: 'Enter', value: false },
    { label: 'Exit', value: true }
  ];

  // Form Models
  protected formState = {
    user: null as any,
    vehicle: null as any,
    driver: null as any,
    camera: null as any,
    room: null as any,
    didLeave: false,
    reason: ''
  };

  private refreshHandle: ReturnType<typeof setInterval> | null = null;
  private relativeTimeHandle: ReturnType<typeof setInterval> | null = null;
  private realtimeRefreshHandle: ReturnType<typeof setTimeout> | null = null;
  private realtimeRetryHandle: ReturnType<typeof setTimeout> | null = null;
  private realtimeUnsubscribers: Array<() => void> = [];
  private authStoreUnsubscribe: (() => void) | null = null;
  private realtimeSetupInFlight = false;

  constructor(
    public authService: AuthService,
    private router: Router,
    private pocketBaseService: PocketBaseService,
    private messageService: MessageService,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.loadDashboard(true);
    this.setupRealtimeSubscriptions();
    this.authStoreUnsubscribe = this.pb.authStore.onChange(() => {
      this.setupRealtimeSubscriptions();
    });

    // Keep `time ago` labels fresh even when no new API event arrives.
    this.relativeTimeHandle = setInterval(() => {
      this.relativeTimeNow.set(Date.now());
    }, 15000);

    this.refreshHandle = setInterval(() => {
      this.loadDashboard(false);
    }, 20000);
  }

  ngOnDestroy(): void {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
      this.refreshHandle = null;
    }

    if (this.relativeTimeHandle) {
      clearInterval(this.relativeTimeHandle);
      this.relativeTimeHandle = null;
    }

    if (this.realtimeRefreshHandle) {
      clearTimeout(this.realtimeRefreshHandle);
      this.realtimeRefreshHandle = null;
    }

    if (this.realtimeRetryHandle) {
      clearTimeout(this.realtimeRetryHandle);
      this.realtimeRetryHandle = null;
    }

    if (this.authStoreUnsubscribe) {
      try {
        this.authStoreUnsubscribe();
      } catch (error) {
        console.error('Failed to unsubscribe authStore listener', error);
      }
      this.authStoreUnsubscribe = null;
    }

    this.clearRealtimeSubscriptions();
  }

  private clearRealtimeSubscriptions(): void {
    if (this.realtimeRefreshHandle) {
      clearTimeout(this.realtimeRefreshHandle);
      this.realtimeRefreshHandle = null;
    }

    for (const unsubscribe of this.realtimeUnsubscribers) {
      try {
        unsubscribe();
      } catch (error) {
        console.error('Failed to unsubscribe dashboard realtime listener', error);
      }
    }
    this.realtimeUnsubscribers = [];
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

  private resetFormState() {
    this.formState = {
      user: null,
      vehicle: null,
      driver: null,
      camera: null,
      room: null,
      didLeave: false,
      reason: ''
    };
  }

  protected quickAction(action: 'vehicle_access' | 'user_access' | 'key_distribute' | 'key_collect'): void {
    this.resetFormState();
    if (action === 'vehicle_access') {
      this.vehicleAccessDialog.set(true);
    } else if (action === 'user_access') {
      this.userAccessDialog.set(true);
    } else if (action === 'key_distribute') {
      this.keyDistributeDialog.set(true);
    } else if (action === 'key_collect') {
      this.keyCollectDialog.set(true);
    }
  }

  // Typeahead methods
  protected async searchUsers(event: AutoCompleteCompleteEvent) {
    try {
      const query = event.query || '';
      const filterStr = query ? `first_name ~ "${query}" || last_name ~ "${query}" || email ~ "${query}" || name ~ "${query}"` : '';
      const options = filterStr ? { filter: filterStr } : {};
      
      const records = await this.pb.collection('users').getList(1, 10, options);
      this.suggestedUsers.set(records.items.map(r => ({
        ...r,
        displayName: r['user_type'] === 'company' && r['name'] 
          ? `${r['name']} (${r['email']})` 
          : `${r['first_name']} ${r['last_name']} (${r['email']})`
      })));
    } catch(e) {
      console.error(e);
    }
  }

  protected async searchDrivers(event: AutoCompleteCompleteEvent) {
    try {
      const query = event.query || '';
      const baseFilter = `(first_name != "" || last_name != "")`;
      const filterStr = query ? `(${baseFilter}) && (first_name ~ "${query}" || last_name ~ "${query}")` : baseFilter;
      
      const records = await this.pb.collection('users').getList(1, 10, { filter: filterStr });
      this.suggestedDrivers.set(records.items.map(r => ({
        ...r,
        displayName: `${r['first_name']} ${r['last_name']}`.trim()
      })));
    } catch(e) {
      console.error(e);
    }
  }

  protected async searchVehicles(event: AutoCompleteCompleteEvent) {
    try {
      const query = event.query || '';
      const filterStr = query ? `number ~ "${query}"` : '';
      const options = filterStr ? { filter: filterStr } : {};

      const records = await this.pb.collection('vehicles').getList(1, 10, options);
      this.suggestedVehicles.set(records.items.map(r => ({
        ...r,
        displayName: `${r['number']} ${r['country'] ? ' - ' + r['country'] : ''}`
      })));
    } catch(e) {
      console.error(e);
    }
  }

  protected async searchCameras(event: AutoCompleteCompleteEvent) {
    try {
      const query = event.query || '';
      const filterStr = query ? `name ~ "${query}"` : '';
      const options = filterStr ? { filter: filterStr } : {};

      const records = await this.pb.collection('cameras').getList(1, 10, options);
      this.suggestedCameras.set(records.items.map(r => ({
        ...r,
        displayName: r['name']
      })));
    } catch(e) {
      console.error(e);
    }
  }

  protected async searchRooms(event: AutoCompleteCompleteEvent) {
    try {
      const query = event.query || '';
      const filterStr = query ? `number ~ "${query}" || name ~ "${query}"` : '';
      const options = filterStr ? { filter: filterStr } : {};

      const records = await this.pb.collection('rooms').getList(1, 10, options);
      this.suggestedRooms.set(records.items.map(r => ({
        ...r,
        displayName: `${r['number']} ${r['name'] ? '- ' + r['name'] : ''}`
      })));
    } catch(e) {
      console.error(e);
    }
  }

  // Submit methods
  protected async submitVehicleAccess() {
    try {
      if (!this.formState.vehicle || !this.formState.camera) {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Vehicle and Camera are required.' });
        return;
      }
      await this.pb.collection('accesses').create({
        access_type: 'vehicle',
        vehicle: this.formState.vehicle.id,
        driver_user: this.formState.driver?.id || null,
        camera: this.formState.camera.id,
        did_leave: false,
        reason: this.formState.reason,
        made_by_user: this.authService.user()?.id,
        deletable: true,
        enabled: true,
      });
      this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Vehicle access recorded.' });
      this.vehicleAccessDialog.set(false);
      this.refreshDashboard();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to record access.' });
    }
  }

  protected async submitUserAccess() {
    try {
      if (!this.formState.user || !this.formState.camera) {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'User and Camera are required.' });
        return;
      }
      await this.pb.collection('accesses').create({
        access_type: 'user',
        user: this.formState.user.id,
        camera: this.formState.camera.id,
        did_leave: this.formState.didLeave,
        reason: this.formState.reason,
        made_by_user: this.authService.user()?.id,
        deletable: true,
        enabled: true,
      });
      this.messageService.add({ severity: 'success', summary: 'Success', detail: 'User access recorded.' });
      this.userAccessDialog.set(false);
      this.refreshDashboard();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to record access.' });
    }
  }

  protected async submitKeyDistribute() {
    try {
      if (!this.formState.user || !this.formState.room) {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'User and Room are required.' });
        return;
      }
      await this.pb.collection('room_key_events').create({
        room: this.formState.room.id,
        user: this.formState.user.id,
        is_collecting: true,
        did_return_key: false,
        reason: this.formState.reason,
        enabled: true
      });
      this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Key distributed.' });
      this.keyDistributeDialog.set(false);
      this.refreshDashboard();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to distribute key.' });
    }
  }

  protected async submitKeyCollect() {
    try {
      if (!this.formState.user || !this.formState.room) {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'User and Room are required.' });
        return;
      }
      // Note: we can also lookup if there is a pending event and link it, but let pb_hooks handle it.
      await this.pb.collection('room_key_events').create({
        room: this.formState.room.id,
        user: this.formState.user.id,
        is_collecting: false,
        did_return_key: true,
        reason: this.formState.reason,
        enabled: true
      });
      this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Key collected.' });
      this.keyCollectDialog.set(false);
      this.refreshDashboard();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to collect key.' });
    }
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

  private async setupRealtimeSubscriptions(): Promise<void> {
    if (this.realtimeSetupInFlight) {
      return;
    }

    this.realtimeSetupInFlight = true;

    this.clearRealtimeSubscriptions();

    if (this.realtimeRetryHandle) {
      clearTimeout(this.realtimeRetryHandle);
      this.realtimeRetryHandle = null;
    }

    try {
      const onRealtimeEvent = (event: { action: string }) => {
        // Changes in both create/update/delete affect summary metrics and latest tables.
        if (event.action === 'create' || event.action === 'update' || event.action === 'delete') {
          this.ngZone.run(() => {
            this.scheduleRealtimeDashboardRefresh();
          });
        }
      };

      const unsubAccesses = await this.pb.collection('accesses').subscribe('*', onRealtimeEvent);

      const unsubRoomKeys = await this.pb.collection('room_key_events').subscribe('*', onRealtimeEvent);

      const unsubCameras = await this.pb.collection('cameras').subscribe('*', onRealtimeEvent);

      const unsubUsers = await this.pb.collection('users').subscribe('*', onRealtimeEvent);

      const unsubVehicles = await this.pb.collection('vehicles').subscribe('*', onRealtimeEvent);

      const unsubRooms = await this.pb.collection('rooms').subscribe('*', onRealtimeEvent);

      this.realtimeUnsubscribers.push(
        unsubAccesses,
        unsubRoomKeys,
        unsubCameras,
        unsubUsers,
        unsubVehicles,
        unsubRooms,
      );

      this.scheduleRealtimeDashboardRefresh();
    } catch (error) {
      console.error('Dashboard realtime subscriptions failed to initialize', error);
      this.realtimeRetryHandle = setTimeout(() => {
        this.realtimeRetryHandle = null;
        this.setupRealtimeSubscriptions();
      }, 3000);
    } finally {
      this.realtimeSetupInFlight = false;
    }
  }

  private scheduleRealtimeDashboardRefresh(): void {
    if (this.realtimeRefreshHandle) {
      return;
    }

    this.realtimeRefreshHandle = setTimeout(() => {
      this.realtimeRefreshHandle = null;
      this.loadDashboard(false);
    }, 250);
  }

  private async loadDashboard(initialLoad: boolean): Promise<void> {
    if (initialLoad) {
      this.loading.set(true);
    } else {
      this.refreshing.set(true);
    }

    try {
      const summary = await this.fetchDashboardSummary();
      const events = summary.events
        .slice()
        .sort((a, b) => this.toTimestamp(b.createdAt) - this.toTimestamp(a.createdAt))
        .map(event => ({
          ...event,
          eventTime: this.formatRelativeTime(event.createdAt),
        }));

      this.latestCameraEvents.set(events);
      this.relativeTimeNow.set(Date.now());
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

  private toTimestamp(isoDate: string): number {
    const ts = Date.parse(isoDate || '');
    return Number.isFinite(ts) ? ts : 0;
  }
}
