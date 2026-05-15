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

type AccessRecord = {
  id: string;
  access_type?: AccessType;
  user?: string;
  vehicle?: string;
  driver_user?: string;
  made_by_user?: string;
  camera?: string;
  did_leave?: boolean;
  enabled?: boolean;
  reason?: string;
  created?: string;
  created_at?: string;
  updated?: string;
  updated_at?: string;
  expand?: {
    user?: any;
    vehicle?: any;
    driver_user?: any;
    made_by_user?: any;
    camera?: any;
  };
};

type RoomKeyEventRecord = {
  id: string;
  is_collecting?: boolean;
  did_return_key?: boolean;
  enabled?: boolean;
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

  protected readonly vehicleRows = computed(() => {
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

    return Array.from(latestByCamera.values()).sort((a, b) => {
      if (a.direction !== b.direction) {
        return a.direction === 'in' ? -1 : 1;
      }

      return this.toTimestamp(b.createdAt) - this.toTimestamp(a.createdAt);
    });
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

  // Form Models
  protected formState = {
    user: null as any,
    vehicle: null as any,
    driver: null as any,
    camera: null as any,
    room: null as any,
    reason: ''
  };

  private realtimeUnsubscribers: Array<() => void> = [];
  private authStoreUnsubscribe: (() => void) | null = null;
  private onlineListener: (() => void) | null = null;
  private realtimeSetupInFlight = false;
  private accessLoadInFlight = false;
  private pendingAccessRefresh = false;
  private keyLoadInFlight = false;
  private pendingKeyRefresh = false;

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
      this.triggerAccessRefresh();
      this.triggerKeyRefresh();
    });

    // Re-attempt realtime subscription when network connectivity returns.
    this.onlineListener = () => {
      this.setupRealtimeSubscriptions();
      this.triggerAccessRefresh();
      this.triggerKeyRefresh();
    };
    window.addEventListener('online', this.onlineListener);
  }

  ngOnDestroy(): void {
    if (this.authStoreUnsubscribe) {
      try {
        this.authStoreUnsubscribe();
      } catch (error) {
        console.error('Failed to unsubscribe authStore listener', error);
      }
      this.authStoreUnsubscribe = null;
    }

    if (this.onlineListener) {
      window.removeEventListener('online', this.onlineListener);
      this.onlineListener = null;
    }

    this.clearRealtimeSubscriptions();
  }

  private clearRealtimeSubscriptions(): void {
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

      const didLeave = this.isEgressCamera(this.formState.camera);

      await this.pb.collection('accesses').create({
        access_type: 'user',
        user: this.formState.user.id,
        camera: this.formState.camera.id,
        did_leave: didLeave,
        reason: this.formState.reason,
        made_by_user: this.authService.user()?.id,
        deletable: true,
        enabled: true,
      });
      this.messageService.add({ severity: 'success', summary: 'Success', detail: 'User access recorded.' });
      this.userAccessDialog.set(false);
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
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to collect key.' });
    }
  }

  protected directionSeverity(direction: 'in' | 'out'): 'success' | 'danger' {
    return direction === 'in' ? 'success' : 'danger';
  }

  private isEgressCamera(camera: any): boolean {
    const direction = String(camera?.direction || '').toLowerCase();
    return direction === 'out' || direction === 'egress';
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

    try {
      const onAccessLikeEvent = (event: { action: string }) => {
        if (
          event.action === 'create'
          || event.action === 'update'
          || event.action === 'delete'
          || event.action === 'PB_CONNECT'
        ) {
          this.ngZone.run(() => {
            this.triggerAccessRefresh();
          });
        }
      };

      const onRoomKeyEvent = (event: { action: string }) => {
        if (
          event.action === 'create'
          || event.action === 'update'
          || event.action === 'delete'
          || event.action === 'PB_CONNECT'
        ) {
          this.ngZone.run(() => {
            this.triggerKeyRefresh();
          });
        }
      };

      const targets: Array<Promise<() => void>> = [
        this.pb.collection('accesses').subscribe('*', onAccessLikeEvent),
        this.pb.collection('cameras').subscribe('*', onAccessLikeEvent),
        this.pb.collection('users').subscribe('*', onAccessLikeEvent),
        this.pb.collection('vehicles').subscribe('*', onAccessLikeEvent),
        this.pb.collection('room_key_events').subscribe('*', onRoomKeyEvent),
      ];

      const results = await Promise.allSettled(targets);

      let successCount = 0;
      let failureCount = 0;
      for (const result of results) {
        if (result.status === 'fulfilled') {
          successCount += 1;
          this.realtimeUnsubscribers.push(result.value);
        } else {
          failureCount += 1;
          console.error('Dashboard realtime subscription failed for one collection', result.reason);
        }
      }

      if (successCount === 0) {
        this.loadError.set('Unable to initialize realtime subscriptions to PocketBase.');
      } else {
        this.loadError.set('');
        if (failureCount > 0) {
          console.warn(`Dashboard realtime partially initialized (${successCount}/${targets.length} subscriptions active).`);
        }
      }
    } catch (error) {
      console.error('Dashboard realtime subscriptions failed to initialize', error);
      this.loadError.set('Unable to initialize realtime subscriptions to PocketBase.');
    } finally {
      this.realtimeSetupInFlight = false;
    }
  }

  private triggerAccessRefresh(): void {
    if (this.accessLoadInFlight) {
      this.pendingAccessRefresh = true;
      return;
    }

    this.accessLoadInFlight = true;
    this.loadAccessData(false)
      .finally(() => {
        this.accessLoadInFlight = false;
        if (this.pendingAccessRefresh) {
          this.pendingAccessRefresh = false;
          this.triggerAccessRefresh();
        }
      });
  }

  private triggerKeyRefresh(): void {
    if (this.keyLoadInFlight) {
      this.pendingKeyRefresh = true;
      return;
    }

    this.keyLoadInFlight = true;
    this.loadKeyMetric(false)
      .finally(() => {
        this.keyLoadInFlight = false;
        if (this.pendingKeyRefresh) {
          this.pendingKeyRefresh = false;
          this.triggerKeyRefresh();
        }
      });
  }

  private async loadDashboard(initialLoad: boolean): Promise<void> {
    if (initialLoad) {
      this.loading.set(true);
    }

    try {
      await Promise.all([
        this.loadAccessData(initialLoad),
        this.loadKeyMetric(initialLoad),
      ]);
      this.lastUpdatedAt.set(new Date().toLocaleString());
      this.loadError.set('');
    } catch (error) {
      console.error('Dashboard data load failed', error);
      this.loadError.set('Unable to load the latest access data from PocketBase.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadAccessData(initialLoad: boolean): Promise<void> {
    if (!initialLoad) {
      this.refreshing.set(true);
    }

    try {
      try {
        const summary = await this.fetchDashboardSummary();
        const latestEvents = summary.events
          .slice()
          .sort((a, b) => this.toTimestamp(b.createdAt) - this.toTimestamp(a.createdAt))
          .slice(0, 50)
          .map((event) => ({
            ...event,
            eventTime: this.formatRelativeTime(event.createdAt),
          }));

        this.latestCameraEvents.set(latestEvents);
        this.vehiclesInside.set(summary.metrics.vehiclesInside);
        this.usersInside.set(summary.metrics.usersInside);
      } catch (summaryError) {
        console.warn('Dashboard summary unavailable, falling back to direct accesses query.', summaryError);

        const records = await this.pb.collection('accesses').getFullList<AccessRecord>({
          sort: '-created',
          expand: 'user,vehicle,driver_user,made_by_user,camera',
        });

        const enabledRecords = records.filter((record) => record.enabled !== false);

        const vehiclesInside = enabledRecords.reduce((count, record) => {
          return count + (record.access_type === 'vehicle' && !record.did_leave ? 1 : 0);
        }, 0);

        const usersInside = enabledRecords.reduce((count, record) => {
          return count + (record.access_type === 'user' && !record.did_leave ? 1 : 0);
        }, 0);

        const latestEvents = enabledRecords
          .slice()
          .sort((a, b) => this.toTimestamp(this.getRecordCreatedAt(b)) - this.toTimestamp(this.getRecordCreatedAt(a)))
          .slice(0, 50)
          .map((record) => this.mapAccessRecord(record));

        this.latestCameraEvents.set(latestEvents);
        this.vehiclesInside.set(vehiclesInside);
        this.usersInside.set(usersInside);
      }

      this.lastUpdatedAt.set(new Date().toLocaleString());
      this.loadError.set('');
    } catch (error) {
      console.error('Dashboard access data load failed', error);
      this.loadError.set('Unable to load latest access events from PocketBase.');
    } finally {
      if (!initialLoad) {
        this.refreshing.set(false);
      }
    }
  }

  private async loadKeyMetric(initialLoad: boolean): Promise<void> {
    if (!initialLoad) {
      this.refreshing.set(true);
    }

    try {
      try {
        const summary = await this.fetchDashboardSummary();
        this.keyDistributed.set(summary.metrics.keyDistributed);
      } catch (summaryError) {
        console.warn('Dashboard summary unavailable, falling back to direct room_key_events query.', summaryError);

        const keyEvents = await this.pb.collection('room_key_events').getFullList<RoomKeyEventRecord>({
          sort: '-created',
        });

        const pendingKeys = keyEvents.reduce((count, event) => {
          if (event.enabled === false) {
            return count;
          }
          return count + (event.is_collecting && !event.did_return_key ? 1 : 0);
        }, 0);

        this.keyDistributed.set(pendingKeys);
      }

      this.lastUpdatedAt.set(new Date().toLocaleString());
      this.loadError.set('');
    } catch (error) {
      console.error('Dashboard key metric load failed', error);
      this.loadError.set('Unable to load key distribution metric from PocketBase.');
    } finally {
      if (!initialLoad) {
        this.refreshing.set(false);
      }
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

  private getRecordCreatedAt(record: AccessRecord): string {
    return record.created || record.created_at || record.updated || record.updated_at || '';
  }

  private mapAccessRecord(record: AccessRecord): AccessRow {
    const accessType: AccessType = record.access_type === 'vehicle' ? 'vehicle' : 'user';
    const didLeave = !!record.did_leave;

    const expandedUser = record.expand?.user;
    const expandedVehicle = record.expand?.vehicle;
    const expandedDriver = record.expand?.driver_user;
    const expandedActor = record.expand?.made_by_user;
    const expandedCamera = record.expand?.camera;

    const subject = accessType === 'vehicle'
      ? (expandedVehicle?.number || record.vehicle || 'Unknown vehicle')
      : this.getUserDisplayName(expandedUser, record.user);

    const actor = accessType === 'vehicle'
      ? this.getUserDisplayName(expandedDriver || expandedActor, record.driver_user || record.made_by_user)
      : this.getUserDisplayName(expandedActor, record.made_by_user || record.user);

    const createdAt = this.getRecordCreatedAt(record);

    return {
      id: record.id,
      accessType,
      subject: subject || (accessType === 'vehicle' ? 'Unknown vehicle' : 'Unknown person'),
      actor: actor || 'System',
      camera: expandedCamera?.name || record.camera || 'Unknown camera',
      direction: didLeave ? 'out' : 'in',
      didLeave,
      reason: record.reason || '-',
      eventTime: this.formatRelativeTime(createdAt),
      createdAt,
    };
  }

  private getUserDisplayName(user: any, fallbackId?: string): string {
    if (!user) {
      return fallbackId || '';
    }

    if (user.user_type === 'company') {
      return user.name || user.email || fallbackId || '';
    }

    const first = user.first_name || '';
    const last = user.last_name || '';
    const fullName = `${first} ${last}`.trim();
    return fullName || user.name || user.email || fallbackId || '';
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
