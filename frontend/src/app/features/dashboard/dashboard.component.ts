import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { AuthService } from '../../core/services/auth.service';
import { PocketBaseService } from '../../core/services/pocketbase.service';
import { QuickActionDialogComponent, QuickActionDialogOption } from '../../shared/components/quick-action-dialog/quick-action-dialog.component';

type AccessType = 'vehicle' | 'user';

type AccessRow = {
  id: string;
  accessType: AccessType;
  subject: string;
  actor: string;
  camera: string;
  direction: 'in' | 'out' | 'checkpoint';
  didLeave: boolean;
  reason: string;
  eventTime: string;
  createdAt: string;
};

type CameraDirection = AccessRow['direction'];

type LastDirectionCameraCard = {
  direction: CameraDirection;
  title: string;
  placeholderReason: string;
  event: AccessRow | null;
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
    direction: 'in' | 'out' | 'checkpoint';
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

type RealtimeEvent<TRecord = any> = {
  action: string;
  record?: TRecord;
};

type QuickActionDialogType = 'vehicle_access' | 'user_access' | 'key_distribute' | 'key_collect';

type UserOption = QuickActionDialogOption;
type VehicleOption = QuickActionDialogOption;
type CameraOption = QuickActionDialogOption & {
  direction?: string;
};
type RoomOption = QuickActionDialogOption;

type QuickActionFormState = {
  user: UserOption | null;
  vehicle: VehicleOption | null;
  camera: CameraOption | null;
  room: RoomOption | null;
  reason: string;
};

type UserSearchRecord = {
  id: string;
  user_type?: string;
  name?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
};

type VehicleSearchRecord = {
  id: string;
  number?: string;
  country?: string;
  owner?: string;
  expand?: {
    owner?: any;
  };
};

type CameraSearchRecord = {
  id: string;
  name?: string;
  direction?: string;
};

type RoomSearchRecord = {
  id: string;
  number?: string;
  name?: string;
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    CardModule,
    TableModule,
    TagModule,
    ToastModule,
    QuickActionDialogComponent,
  ],
  providers: [MessageService],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  protected readonly loading = signal(true);
  protected readonly refreshing = signal(false);
  protected readonly loadError = signal('');

  /** Localized, user-facing strings for toasts and status messages. */
  private readonly msg = {
    error: $localize`:@@common.error:Error`,
    success: $localize`:@@common.success:Success`,
    vehicleCameraRequired: $localize`:@@dashboard.msg.vehicleCameraRequired:Vehicle and Camera are required.`,
    driverRequired: $localize`:@@dashboard.msg.driverRequired:Authenticated driver is required to record vehicle access.`,
    vehicleRecorded: $localize`:@@dashboard.msg.vehicleRecorded:Vehicle access recorded.`,
    accessFailed: $localize`:@@dashboard.msg.accessFailed:Failed to record access.`,
    userCameraRequired: $localize`:@@dashboard.msg.userCameraRequired:User and Camera are required.`,
    userRecorded: $localize`:@@dashboard.msg.userRecorded:User access recorded.`,
    userRoomRequired: $localize`:@@dashboard.msg.userRoomRequired:User and Room are required.`,
    keyDistributed: $localize`:@@dashboard.msg.keyDistributed:Key distributed.`,
    keyDistributeFailed: $localize`:@@dashboard.msg.keyDistributeFailed:Failed to distribute key.`,
    keyCollected: $localize`:@@dashboard.msg.keyCollected:Key collected.`,
    keyCollectFailed: $localize`:@@dashboard.msg.keyCollectFailed:Failed to collect key.`,
    realtimePaused: $localize`:@@dashboard.err.realtimePaused:Realtime paused because the current session is not authenticated.`,
    sessionExpired: $localize`:@@dashboard.err.sessionExpired:Session expired. Please sign in again.`,
    realtimePartial: $localize`:@@dashboard.err.realtimePartial:Realtime is partially connected. Recovering connection...`,
    realtimeFailed: $localize`:@@dashboard.err.realtimeFailed:Unable to initialize realtime subscriptions to PocketBase. Retrying...`,
    loadAccessFailed: $localize`:@@dashboard.err.loadAccessFailed:Unable to load the latest access data from PocketBase.`,
    loadEventsFailed: $localize`:@@dashboard.err.loadEventsFailed:Unable to load latest access events from PocketBase.`,
    loadKeyFailed: $localize`:@@dashboard.err.loadKeyFailed:Unable to load key distribution metric from PocketBase.`,
  };

  /** Localized labels bound into component inputs (PrimeNG props / fallbacks). */
  protected readonly ui = {
    refresh: $localize`:@@common.refresh:Refresh`,
    addVehicleAccess: $localize`:@@dashboard.action.addVehicleAccess:Add Vehicle Access`,
    addUserAccess: $localize`:@@dashboard.action.addUserAccess:Add User Access`,
    distributeKey: $localize`:@@dashboard.action.distributeKey:Distribute Key`,
    collectKey: $localize`:@@dashboard.action.collectKey:Collect Key`,
    noCameraEvent: $localize`:@@dashboard.camera.noEvent:No camera event yet`,
    noRecentEvent: $localize`:@@dashboard.camera.noRecent:No recent event`,
    vehicleNotAvailable: $localize`:@@dashboard.camera.vehicleNA:Vehicle not available`,
    driverNotAvailable: $localize`:@@dashboard.camera.driverNA:Driver not available`,
    // Quick-action dialog field labels, placeholders and submit buttons.
    dlgVehicleAccess: $localize`:@@dashboard.dlg.vehicleAccess:Vehicle Access`,
    dlgUserAccess: $localize`:@@dashboard.dlg.userAccess:User Access`,
    fieldVehicle: $localize`:@@field.vehicle:Vehicle`,
    fieldCamera: $localize`:@@field.camera:Camera`,
    fieldUser: $localize`:@@field.user:User`,
    fieldRoom: $localize`:@@field.room:Room`,
    confirmReturnByUser: $localize`:@@dashboard.dlg.confirmReturnByUser:Confirm Return by User`,
    searchPlate: $localize`:@@dashboard.ph.searchPlate:Search license plate...`,
    searchCamera: $localize`:@@dashboard.ph.searchCamera:Search camera...`,
    searchUser: $localize`:@@dashboard.ph.searchUser:Search user...`,
    searchRoom: $localize`:@@dashboard.ph.searchRoom:Search room...`,
    saveAccess: $localize`:@@dashboard.action.saveAccess:Save Access`,
    distribute: $localize`:@@dashboard.action.distribute:Distribute`,
    collect: $localize`:@@dashboard.action.collect:Collect`,
  };

  protected readonly latestCameraEvents = signal<AccessRow[]>([]);
  protected readonly vehiclesInside = signal(0);
  protected readonly usersInside = signal(0);
  protected readonly keyDistributed = signal(0);
  protected readonly lastUpdatedAt = signal('');

  /** Per-direction glow trigger, pulsed briefly when a fresh realtime event lands on a camera card. */
  protected readonly cameraFlash = signal<Record<CameraDirection, boolean>>({
    in: false,
    checkpoint: false,
    out: false,
  });

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

  protected readonly lastDirectionCameraCards = computed<LastDirectionCameraCard[]>(() => {
    const latestByDirection: Record<CameraDirection, AccessRow | null> = {
      in: null,
      checkpoint: null,
      out: null,
    };

    const latestTimestampByDirection: Record<CameraDirection, number> = {
      in: 0,
      checkpoint: 0,
      out: 0,
    };

    for (const row of this.latestCameraEvents()) {
      if (row.accessType !== 'vehicle') {
        continue;
      }

      const ts = this.toTimestamp(row.createdAt);
      const currentLatest = latestTimestampByDirection[row.direction];
      if (ts >= currentLatest) {
        latestTimestampByDirection[row.direction] = ts;
        latestByDirection[row.direction] = {
          ...row,
          eventTime: this.formatRelativeTime(row.createdAt),
        };
      }
    }

    return [
      {
        direction: 'in',
        title: $localize`:@@direction.ingress:Ingress`,
        placeholderReason: $localize`:@@dashboard.camera.waitIngress:Waiting for the first ingress vehicle event.`,
        event: latestByDirection.in,
      },
      {
        direction: 'checkpoint',
        title: $localize`:@@direction.checkpoint:Checkpoint`,
        placeholderReason: $localize`:@@dashboard.camera.waitCheckpoint:Waiting for the first checkpoint vehicle event.`,
        event: latestByDirection.checkpoint,
      },
      {
        direction: 'out',
        title: $localize`:@@direction.egress:Egress`,
        placeholderReason: $localize`:@@dashboard.camera.waitEgress:Waiting for the first egress vehicle event.`,
        event: latestByDirection.out,
      },
    ];
  });

  // Dialog Visibilities
  protected readonly vehicleAccessDialog = signal(false);
  protected readonly userAccessDialog = signal(false);
  protected readonly keyDistributeDialog = signal(false);
  protected readonly keyCollectDialog = signal(false);

  // Autocomplete Suggestions
  protected readonly suggestedUsers = signal<UserOption[]>([]);
  protected readonly suggestedVehicles = signal<VehicleOption[]>([]);
  protected readonly suggestedCameras = signal<CameraOption[]>([]);
  protected readonly suggestedRooms = signal<RoomOption[]>([]);

  // Form Models
  protected readonly quickActionForm = signal<QuickActionFormState>(this.createEmptyQuickActionFormState());

  private realtimeUnsubscribers: Array<() => void> = [];
  private authStoreUnsubscribe: (() => void) | null = null;
  private onlineListener: (() => void) | null = null;
  private visibilityListener: (() => void) | null = null;
  private realtimeSetupInFlight = false;
  private realtimeRetryTimer: ReturnType<typeof window.setTimeout> | null = null;
  private realtimeRetryDelayMs = 1000;
  private readonly realtimeRetryMaxDelayMs = 30000;
  private accessLoadInFlight = false;
  private pendingAccessRefresh = false;
  private accessReconcileTimer: ReturnType<typeof window.setTimeout> | null = null;
  private keyLoadInFlight = false;
  private pendingKeyRefresh = false;
  private periodicConsistencyTimer: ReturnType<typeof window.setInterval> | null = null;
  private readonly periodicConsistencyMs = 30000;
  private readonly cameraFlashTimers: Record<CameraDirection, ReturnType<typeof window.setTimeout> | null> = {
    in: null,
    checkpoint: null,
    out: null,
  };
  /** Kept a touch longer than the CSS animation so the class lingers until the glow settles. */
  private readonly cameraFlashDurationMs = 1600;

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
    this.startPeriodicConsistencySync();

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

    // Rebind subscriptions when the tab becomes active again.
    this.visibilityListener = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      this.setupRealtimeSubscriptions();
      this.triggerAccessRefresh();
      this.triggerKeyRefresh();
    };
    document.addEventListener('visibilitychange', this.visibilityListener);
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

    if (this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }

    this.stopPeriodicConsistencySync();
    this.clearRealtimeRetryTimer();
    this.clearAccessReconcileTimer();
    this.clearCameraFlashTimers();

    this.clearRealtimeSubscriptions();
  }

  private clearCameraFlashTimers(): void {
    for (const direction of Object.keys(this.cameraFlashTimers) as CameraDirection[]) {
      const timer = this.cameraFlashTimers[direction];
      if (timer !== null) {
        window.clearTimeout(timer);
        this.cameraFlashTimers[direction] = null;
      }
    }
  }

  /**
   * Briefly glows the camera card for the given direction. Resets on the current frame and
   * re-applies on the next so rapid back-to-back events on the same card restart the animation.
   */
  private flashCameraCard(direction: CameraDirection): void {
    const existingTimer = this.cameraFlashTimers[direction];
    if (existingTimer !== null) {
      window.clearTimeout(existingTimer);
      this.cameraFlashTimers[direction] = null;
    }

    this.cameraFlash.update((state) => ({ ...state, [direction]: false }));

    window.requestAnimationFrame(() => {
      this.ngZone.run(() => {
        this.cameraFlash.update((state) => ({ ...state, [direction]: true }));

        this.cameraFlashTimers[direction] = window.setTimeout(() => {
          this.ngZone.run(() => {
            this.cameraFlash.update((state) => ({ ...state, [direction]: false }));
          });
          this.cameraFlashTimers[direction] = null;
        }, this.cameraFlashDurationMs);
      });
    });
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

  private clearRealtimeRetryTimer(): void {
    if (this.realtimeRetryTimer !== null) {
      window.clearTimeout(this.realtimeRetryTimer);
      this.realtimeRetryTimer = null;
    }
  }

  private clearAccessReconcileTimer(): void {
    if (this.accessReconcileTimer !== null) {
      window.clearTimeout(this.accessReconcileTimer);
      this.accessReconcileTimer = null;
    }
  }

  private resetRealtimeRetryBackoff(): void {
    this.realtimeRetryDelayMs = 1000;
    this.clearRealtimeRetryTimer();
  }

  private scheduleRealtimeRetry(reason: string): void {
    if (this.realtimeRetryTimer !== null) {
      return;
    }

    const delayMs = this.realtimeRetryDelayMs;
    console.warn(`[dashboard realtime] retrying subscription setup in ${delayMs}ms (${reason})`);

    this.realtimeRetryTimer = window.setTimeout(() => {
      this.realtimeRetryTimer = null;
      this.setupRealtimeSubscriptions();
    }, delayMs);

    this.realtimeRetryDelayMs = Math.min(this.realtimeRetryDelayMs * 2, this.realtimeRetryMaxDelayMs);
  }

  private getRealtimeErrorText(reason: unknown): string {
    if (reason instanceof Error) {
      return reason.message || String(reason);
    }

    return String(reason || '');
  }

  private async tryRefreshAuthForRealtime(): Promise<boolean> {
    if (!this.pb.authStore.isValid) {
      return false;
    }

    try {
      await this.pb.collection('users').authRefresh();
      return true;
    } catch (error) {
      console.error('[dashboard realtime] auth refresh failed:', error);
      return false;
    }
  }

  private startPeriodicConsistencySync(): void {
    if (this.periodicConsistencyTimer !== null) {
      return;
    }

    this.periodicConsistencyTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      this.triggerAccessRefresh();
      this.triggerKeyRefresh();
    }, this.periodicConsistencyMs);
  }

  private stopPeriodicConsistencySync(): void {
    if (this.periodicConsistencyTimer !== null) {
      window.clearInterval(this.periodicConsistencyTimer);
      this.periodicConsistencyTimer = null;
    }
  }

  private scheduleAccessReconcile(): void {
    if (this.accessReconcileTimer !== null) {
      return;
    }

    this.accessReconcileTimer = window.setTimeout(() => {
      this.accessReconcileTimer = null;
      this.triggerAccessRefresh();
    }, 1200);
  }

  protected refreshDashboard(): void {
    this.loadDashboard(false);
  }

  protected signOut(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  private createEmptyQuickActionFormState(): QuickActionFormState {
    return {
      user: null,
      vehicle: null,
      camera: null,
      room: null,
      reason: '',
    };
  }

  private patchQuickActionFormState(partial: Partial<QuickActionFormState>): void {
    this.quickActionForm.update((currentState) => ({
      ...currentState,
      ...partial,
    }));
  }

  private resetQuickActionFormState(): void {
    this.quickActionForm.set(this.createEmptyQuickActionFormState());
  }

  private setDialogVisibility(action: QuickActionDialogType, visible: boolean): void {
    if (action === 'vehicle_access') {
      this.vehicleAccessDialog.set(visible);
      return;
    }

    if (action === 'user_access') {
      this.userAccessDialog.set(visible);
      return;
    }

    if (action === 'key_distribute') {
      this.keyDistributeDialog.set(visible);
      return;
    }

    this.keyCollectDialog.set(visible);
  }

  protected onDialogVisibilityChange(action: QuickActionDialogType, visible: boolean): void {
    this.setDialogVisibility(action, visible);
    if (!visible) {
      this.resetQuickActionFormState();
    }
  }

  protected setUserSelection(option: QuickActionDialogOption | null): void {
    this.patchQuickActionFormState({ user: option as UserOption | null });
  }

  protected setVehicleSelection(option: QuickActionDialogOption | null): void {
    this.patchQuickActionFormState({ vehicle: option as VehicleOption | null });
  }

  protected setCameraSelection(option: QuickActionDialogOption | null): void {
    this.patchQuickActionFormState({ camera: option as CameraOption | null });
  }

  protected setRoomSelection(option: QuickActionDialogOption | null): void {
    this.patchQuickActionFormState({ room: option as RoomOption | null });
  }

  protected setQuickActionReason(reason: string): void {
    this.patchQuickActionFormState({ reason });
  }

  protected quickAction(action: QuickActionDialogType): void {
    this.resetQuickActionFormState();
    this.setDialogVisibility(action, true);
  }

  // Typeahead methods
  protected async searchUsers(query: string): Promise<void> {
    try {
      const normalizedQuery = query.trim();
      const escapedQuery = this.escapeFilterValue(normalizedQuery);
      const filter = escapedQuery
        ? `first_name ~ "${escapedQuery}" || last_name ~ "${escapedQuery}" || email ~ "${escapedQuery}" || name ~ "${escapedQuery}"`
        : '';
      const options = filter ? { filter } : {};

      const records = await this.pb.collection('users').getList<UserSearchRecord>(1, 10, options);
      this.suggestedUsers.set(records.items.map((record) => {
        const email = (record.email || '').trim();
        const companyName = (record.name || '').trim();
        const firstName = (record.first_name || '').trim();
        const lastName = (record.last_name || '').trim();
        const fullName = `${firstName} ${lastName}`.trim();

        const displayName = record.user_type === 'company' && companyName
          ? `${companyName}${email ? ` (${email})` : ''}`
          : `${fullName || email || 'Unknown user'}${fullName && email ? ` (${email})` : ''}`;

        return {
          id: record.id,
          displayName,
          email,
          user_type: record.user_type,
        };
      }));
    } catch (error) {
      console.error(error);
    }
  }

  protected async searchEmployees(query: string): Promise<void> {
    try {
      const normalizedQuery = query.trim();
      const escapedQuery = this.escapeFilterValue(normalizedQuery);
      const filter = `user_type = "employee"${escapedQuery ? ` && (first_name ~ "${escapedQuery}" || last_name ~ "${escapedQuery}" || email ~ "${escapedQuery}" || name ~ "${escapedQuery}")` : ''}`;
      const options = { filter };

      const records = await this.pb.collection('users').getList<UserSearchRecord>(1, 10, options);
      this.suggestedUsers.set(records.items.map((record) => {
        const email = (record.email || '').trim();
        const firstName = (record.first_name || '').trim();
        const lastName = (record.last_name || '').trim();
        const fullName = `${firstName} ${lastName}`.trim();

        const displayName = `${fullName || email || 'Unknown employee'}${fullName && email ? ` (${email})` : ''}`;

        return {
          id: record.id,
          displayName,
          email,
          user_type: record.user_type,
        };
      }));
    } catch (error) {
      console.error(error);
    }
  }

  protected async searchVehicles(query: string): Promise<void> {
    try {
      const normalizedQuery = query.trim();
      const escapedQuery = this.escapeFilterValue(normalizedQuery);
      // Match the plate number as well as the owner's name/company/email.
      const filter = escapedQuery
        ? `number ~ "${escapedQuery}"`
          + ` || owner.first_name ~ "${escapedQuery}"`
          + ` || owner.last_name ~ "${escapedQuery}"`
          + ` || owner.name ~ "${escapedQuery}"`
          + ` || owner.email ~ "${escapedQuery}"`
        : '';
      const options: Record<string, unknown> = { expand: 'owner' };
      if (filter) {
        options['filter'] = filter;
      }

      const records = await this.pb.collection('vehicles').getList<VehicleSearchRecord>(1, 10, options);
      this.suggestedVehicles.set(records.items.map((record) => {
        const base = `${record.number || ''}${record.country ? ` - ${record.country}` : ''}`.trim() || 'Unknown vehicle';
        const ownerName = this.getUserDisplayName(record.expand?.owner);
        return {
          id: record.id,
          displayName: ownerName ? `${base} · ${ownerName}` : base,
        };
      }));
    } catch (error) {
      console.error(error);
    }
  }

  protected async searchCameras(query: string): Promise<void> {
    try {
      const normalizedQuery = query.trim();
      const escapedQuery = this.escapeFilterValue(normalizedQuery);
      const filter = escapedQuery ? `name ~ "${escapedQuery}"` : '';
      const options = filter ? { filter } : {};

      const records = await this.pb.collection('cameras').getList<CameraSearchRecord>(1, 10, options);
      this.suggestedCameras.set(records.items.map((record) => ({
        id: record.id,
        displayName: record.name || 'Unknown camera',
        direction: record.direction,
      })));
    } catch (error) {
      console.error(error);
    }
  }

  protected async searchRooms(query: string): Promise<void> {
    try {
      const normalizedQuery = query.trim();
      const escapedQuery = this.escapeFilterValue(normalizedQuery);
      const filter = escapedQuery ? `number ~ "${escapedQuery}" || name ~ "${escapedQuery}"` : '';
      const options = filter ? { filter } : {};

      const records = await this.pb.collection('rooms').getList<RoomSearchRecord>(1, 10, options);
      this.suggestedRooms.set(records.items.map((record) => ({
        id: record.id,
        displayName: `${record.number || ''}${record.name ? ` - ${record.name}` : ''}`.trim() || 'Unknown room',
      })));
    } catch (error) {
      console.error(error);
    }
  }

  // Submit methods
  protected async submitVehicleAccess() {
    const formState = this.quickActionForm();

    try {
      if (!formState.vehicle || !formState.camera) {
        this.messageService.add({ severity: 'error', summary: this.msg.error, detail: this.msg.vehicleCameraRequired });
        return;
      }

      const currentUser = this.authService.user();
      if (!currentUser?.id) {
        this.messageService.add({ severity: 'error', summary: this.msg.error, detail: this.msg.driverRequired });
        return;
      }

      await this.pb.collection('accesses').create({
        access_type: 'vehicle',
        vehicle: formState.vehicle.id,
        driver_user: currentUser.id,
        camera: formState.camera.id,
        did_leave: false,
        reason: formState.reason,
        made_by_user: currentUser.id,
        deletable: true,
        enabled: true,
      });
      this.messageService.add({ severity: 'success', summary: this.msg.success, detail: this.msg.vehicleRecorded });
      this.vehicleAccessDialog.set(false);
      this.resetQuickActionFormState();
      this.triggerAccessRefresh();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: this.msg.error, detail: e.message || this.msg.accessFailed });
    }
  }

  protected async submitUserAccess() {
    const formState = this.quickActionForm();

    try {
      if (!formState.user || !formState.camera) {
        this.messageService.add({ severity: 'error', summary: this.msg.error, detail: this.msg.userCameraRequired });
        return;
      }

      const didLeave = this.isEgressCamera(formState.camera);

      await this.pb.collection('accesses').create({
        access_type: 'user',
        user: formState.user.id,
        camera: formState.camera.id,
        did_leave: didLeave,
        reason: formState.reason,
        made_by_user: this.authService.user()?.id,
        deletable: true,
        enabled: true,
      });
      this.messageService.add({ severity: 'success', summary: this.msg.success, detail: this.msg.userRecorded });
      this.userAccessDialog.set(false);
      this.resetQuickActionFormState();
      this.triggerAccessRefresh();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: this.msg.error, detail: e.message || this.msg.accessFailed });
    }
  }

  protected async submitKeyDistribute() {
    const formState = this.quickActionForm();

    try {
      if (!formState.user || !formState.room) {
        this.messageService.add({ severity: 'error', summary: this.msg.error, detail: this.msg.userRoomRequired });
        return;
      }
      await this.pb.collection('room_key_events').create({
        room: formState.room.id,
        user: formState.user.id,
        is_collecting: true,
        did_return_key: false,
        reason: formState.reason,
        enabled: true
      });
      this.messageService.add({ severity: 'success', summary: this.msg.success, detail: this.msg.keyDistributed });
      this.keyDistributeDialog.set(false);
      this.resetQuickActionFormState();
      this.triggerKeyRefresh();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: this.msg.error, detail: e.message || this.msg.keyDistributeFailed });
    }
  }

  protected async submitKeyCollect() {
    const formState = this.quickActionForm();

    try {
      if (!formState.user || !formState.room) {
        this.messageService.add({ severity: 'error', summary: this.msg.error, detail: this.msg.userRoomRequired });
        return;
      }
      // Note: we can also lookup if there is a pending event and link it, but let pb_hooks handle it.
      await this.pb.collection('room_key_events').create({
        room: formState.room.id,
        user: formState.user.id,
        is_collecting: false,
        did_return_key: true,
        reason: formState.reason,
        enabled: true
      });
      this.messageService.add({ severity: 'success', summary: this.msg.success, detail: this.msg.keyCollected });
      this.keyCollectDialog.set(false);
      this.resetQuickActionFormState();
      this.triggerKeyRefresh();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: this.msg.error, detail: e.message || this.msg.keyCollectFailed });
    }
  }

  protected directionSeverity(direction: AccessRow['direction']): 'success' | 'danger' | 'warn' {
    if (direction === 'out') {
      return 'danger';
    }

    if (direction === 'checkpoint') {
      return 'warn';
    }

    return 'success';
  }

  private isEgressCamera(camera: CameraOption): boolean {
    const direction = String(camera?.direction || '').toLowerCase();
    return direction === 'out' || direction === 'egress';
  }

  protected leaveSeverity(left: boolean): 'success' | 'warn' {
    return left ? 'success' : 'warn';
  }

  protected accessTypeSeverity(type: AccessType): 'info' | 'contrast' {
    return type === 'vehicle' ? 'contrast' : 'info';
  }

  private escapeFilterValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private get pb() {
    return this.pocketBaseService.pb;
  }

  private async setupRealtimeSubscriptions(): Promise<void> {
    if (this.realtimeSetupInFlight) {
      return;
    }

    if (!this.pb.authStore.isValid) {
      this.loadError.set(this.msg.realtimePaused);
      this.scheduleRealtimeRetry('auth store is not valid');
      return;
    }

    this.realtimeSetupInFlight = true;

    this.clearRealtimeSubscriptions();

    try {
      const onAccessEvent = (event: RealtimeEvent<AccessRecord>) => {
        this.ngZone.run(() => {
          if (event.action === 'create' && event.record) {
            this.applyRealtimeAccessCreate(event.record);
            return;
          }

          if (
            event.action === 'update'
            || event.action === 'delete'
            || event.action === 'PB_CONNECT'
          ) {
            this.triggerAccessRefresh();
          }
        });
      };

      const onRoomKeyEvent = (event: RealtimeEvent<RoomKeyEventRecord>) => {
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
        this.pb.collection('accesses').subscribe('*', onAccessEvent, {
          expand: 'user,vehicle,driver_user,made_by_user,camera',
          requestKey: null,
        }),
        this.pb.collection('cameras').subscribe('*', () => this.ngZone.run(() => this.triggerAccessRefresh())),
        this.pb.collection('users').subscribe('*', () => this.ngZone.run(() => this.triggerAccessRefresh())),
        this.pb.collection('vehicles').subscribe('*', () => this.ngZone.run(() => this.triggerAccessRefresh())),
        this.pb.collection('room_key_events').subscribe('*', onRoomKeyEvent),
      ];

      const results = await Promise.allSettled(targets);

      let successCount = 0;
      let failureCount = 0;
      let unauthorizedDetected = false;
      for (const result of results) {
        if (result.status === 'fulfilled') {
          successCount += 1;
          this.realtimeUnsubscribers.push(result.value);
        } else {
          failureCount += 1;
          const reasonText = this.getRealtimeErrorText(result.reason);
          if (reasonText.includes('401') || reasonText.toLowerCase().includes('unauthorized')) {
            unauthorizedDetected = true;
          }
          console.error('Dashboard realtime subscription failed for one collection', result.reason);
        }
      }

      if (unauthorizedDetected) {
        const authRefreshed = await this.tryRefreshAuthForRealtime();
        if (authRefreshed) {
          this.scheduleRealtimeRetry('authentication refreshed after realtime 401');
          return;
        }

        this.loadError.set(this.msg.sessionExpired);
        this.signOut();
        return;
      }

      if (successCount === targets.length) {
        this.resetRealtimeRetryBackoff();
        this.loadError.set('');
        return;
      }

      if (successCount > 0) {
        this.loadError.set(this.msg.realtimePartial);
        console.warn(`Dashboard realtime partially initialized (${successCount}/${targets.length} subscriptions active).`);
        this.scheduleRealtimeRetry('partial realtime subscription state');
        return;
      }

      this.loadError.set(this.msg.realtimeFailed);
      this.scheduleRealtimeRetry('all realtime subscriptions failed');
    } catch (error) {
      console.error('Dashboard realtime subscriptions failed to initialize', error);
      this.loadError.set(this.msg.realtimeFailed);
      this.scheduleRealtimeRetry('subscription setup threw an exception');
    } finally {
      this.realtimeSetupInFlight = false;
    }
  }

  private applyRealtimeAccessCreate(record: AccessRecord): void {
    if (record.enabled === false) {
      return;
    }

    const mapped = this.mapAccessRecord(record);

    this.latestCameraEvents.update((existingRows) => {
      const nextRows = [
        mapped,
        ...existingRows.filter((row) => row.id !== mapped.id),
      ]
        .sort((a, b) => this.toTimestamp(b.createdAt) - this.toTimestamp(a.createdAt))
        .slice(0, 50);

      return nextRows;
    });

    // Camera cards track vehicle events per direction — glow the matching card as it refreshes.
    if (mapped.accessType === 'vehicle') {
      this.flashCameraCard(mapped.direction);
    }

    if (mapped.accessType === 'vehicle' && !mapped.didLeave && mapped.direction !== 'checkpoint') {
      this.vehiclesInside.update((count) => count + 1);
    }

    if (mapped.accessType === 'user' && !mapped.didLeave && mapped.direction !== 'checkpoint') {
      this.usersInside.update((count) => count + 1);
    }

    this.lastUpdatedAt.set(new Date().toLocaleString());

    // Reconcile with server-side aggregates in case hooks apply additional logic.
    this.scheduleAccessReconcile();
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
      this.loadError.set(this.msg.loadAccessFailed);
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
          return count + (record.access_type === 'vehicle' && !record.did_leave && record.expand?.camera?.direction !== 'checkpoint' ? 1 : 0);
        }, 0);

        const usersInside = enabledRecords.reduce((count, record) => {
          return count + (record.access_type === 'user' && !record.did_leave && record.expand?.camera?.direction !== 'checkpoint' ? 1 : 0);
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
      this.loadError.set(this.msg.loadEventsFailed);
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
      this.loadError.set(this.msg.loadKeyFailed);
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

    const cameraDirection = this.normalizeDirection(expandedCamera?.direction, didLeave);

    return {
      id: record.id,
      accessType,
      subject: subject || (accessType === 'vehicle' ? 'Unknown vehicle' : 'Unknown person'),
      actor: actor || 'System',
      camera: expandedCamera?.name || record.camera || 'Unknown camera',
      direction: cameraDirection,
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

  protected directionLabel(direction: AccessRow['direction']): string {
    if (direction === 'out') {
      return $localize`:@@direction.egress:Egress`;
    }

    if (direction === 'checkpoint') {
      return $localize`:@@direction.checkpoint:Checkpoint`;
    }

    return $localize`:@@direction.ingress:Ingress`;
  }

  protected directionIcon(direction: AccessRow['direction']): string {
    if (direction === 'out') {
      return 'pi-sign-out';
    }

    if (direction === 'checkpoint') {
      return 'pi-map-marker';
    }

    return 'pi-sign-in';
  }

  protected cardThemeClass(direction: CameraDirection): string {
    if (direction === 'out') {
      return 'camera-card-out';
    }

    if (direction === 'checkpoint') {
      return 'camera-card-checkpoint';
    }

    return 'camera-card-in';
  }

  private normalizeDirection(rawDirection: unknown, didLeaveFallback = false): AccessRow['direction'] {
    if (rawDirection === 'out' || rawDirection === 'egress') {
      return 'out';
    }

    if (rawDirection === 'checkpoint') {
      return 'checkpoint';
    }

    return didLeaveFallback ? 'out' : 'in';
  }
}
