import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../../core/services/auth.service';
import { PocketBaseService } from '../../core/services/pocketbase.service';
import { QuickActionDialogComponent, QuickActionDialogOption } from '../../shared/components/quick-action-dialog/quick-action-dialog.component';

type AccessType = 'vehicle' | 'user';

type AccessRow = {
  id: string;
  accessType: AccessType;
  subject: string;
  actor: string;
  gate: string;
  direction: 'in' | 'out' | 'checkpoint';
  didLeave: boolean;
  reason: string;
  eventTime: string;
  createdAt: string;
};

type GateDirection = AccessRow['direction'];

type LastDirectionGateCard = {
  direction: GateDirection;
  title: string;
  placeholderReason: string;
  event: AccessRow | null;
};

type PresentVehicle = {
  id: string;
  number: string;
  driver: string;
  gate: string;
  since: string;
};

type PresentPerson = {
  id: string;
  name: string;
  via: 'foot' | 'vehicle';
  vehicle?: string;
  since: string;
};

type DistributedKey = {
  id: string;
  room: string;
  holder: string;
  since: string;
};

type DashboardSummaryResponse = {
  metrics: {
    vehiclesInside: number;
    usersInside: number;
    keyDistributed: number;
  };
  insideVehicleIds?: string[];
  insideUserIds?: string[];
  presentVehicles?: PresentVehicle[];
  presentPeople?: PresentPerson[];
  distributedKeys?: DistributedKey[];
  events: Array<{
    id: string;
    accessType: AccessType;
    subject: string;
    actor: string;
    gate: string;
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
  gate?: string;
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
    gate?: any;
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
type GateOption = QuickActionDialogOption & {
  direction?: string;
};
type RoomOption = QuickActionDialogOption;

type QuickActionFormState = {
  user: UserOption | null;
  vehicle: VehicleOption | null;
  gate: GateOption | null;
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

type GateSearchRecord = {
  id: string;
  name?: string;
  direction?: string;
};

type RoomSearchRecord = {
  id: string;
  number?: string;
  name?: string;
  key_collected?: boolean;
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
    QuickActionDialogComponent,
  ],
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
    vehicleGateRequired: $localize`:@@dashboard.msg.vehicleGateRequired:Vehicle and Gate are required.`,
    driverRequired: $localize`:@@dashboard.msg.driverRequired:Authenticated driver is required to record vehicle access.`,
    vehicleAlreadyInside: $localize`:@@dashboard.msg.vehicleAlreadyInside:This vehicle is already inside and cannot enter again.`,
    vehicleNotInside: $localize`:@@dashboard.msg.vehicleNotInside:Only vehicles currently inside can exit through an egress gate.`,
    vehicleRecorded: $localize`:@@dashboard.msg.vehicleRecorded:Vehicle access recorded.`,
    accessFailed: $localize`:@@dashboard.msg.accessFailed:Failed to record access.`,
    userGateRequired: $localize`:@@dashboard.msg.userGateRequired:User and Gate are required.`,
    userAlreadyInside: $localize`:@@dashboard.msg.userAlreadyInside:This person is already inside and cannot enter again.`,
    userNotInside: $localize`:@@dashboard.msg.userNotInside:Only people currently inside can exit through an egress gate.`,
    userRecorded: $localize`:@@dashboard.msg.userRecorded:User access recorded.`,
    userRoomRequired: $localize`:@@dashboard.msg.userRoomRequired:User and Room are required.`,
    keyDistributed: $localize`:@@dashboard.msg.keyDistributed:Key distributed.`,
    keyDistributeFailed: $localize`:@@dashboard.msg.keyDistributeFailed:Failed to distribute key.`,
    keyCollected: $localize`:@@dashboard.msg.keyCollected:Key collected.`,
    keyCollectFailed: $localize`:@@dashboard.msg.keyCollectFailed:Failed to collect key.`,
    keyAlreadyDistributed: $localize`:@@key.alreadyDistributed:This room's key is already distributed.`,
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
    noGateEvent: $localize`:@@dashboard.gate.noEvent:No gate event yet`,
    noRecentEvent: $localize`:@@dashboard.gate.noRecent:No recent event`,
    vehicleNotAvailable: $localize`:@@dashboard.gate.vehicleNA:Vehicle not available`,
    driverNotAvailable: $localize`:@@dashboard.gate.driverNA:Driver not available`,
    // Quick-action dialog field labels, placeholders and submit buttons.
    dlgVehicleAccess: $localize`:@@dashboard.dlg.vehicleAccess:Vehicle Access`,
    dlgUserAccess: $localize`:@@dashboard.dlg.userAccess:User Access`,
    fieldVehicle: $localize`:@@field.vehicle:Vehicle`,
    fieldGate: $localize`:@@field.gate:Gate`,
    fieldUser: $localize`:@@field.user:User`,
    fieldRoom: $localize`:@@field.room:Room`,
    confirmReturnByUser: $localize`:@@dashboard.dlg.confirmReturnByUser:Confirm Return by User`,
    searchPlate: $localize`:@@dashboard.ph.searchPlate:Search license plate...`,
    searchGate: $localize`:@@dashboard.ph.searchGate:Search gate...`,
    searchUser: $localize`:@@dashboard.ph.searchUser:Search user...`,
    searchRoom: $localize`:@@dashboard.ph.searchRoom:Search room...`,
    saveAccess: $localize`:@@dashboard.action.saveAccess:Save Access`,
    distribute: $localize`:@@dashboard.action.distribute:Distribute`,
    collect: $localize`:@@dashboard.action.collect:Collect`,
    // Current-status section
    statusVehicles: $localize`:@@dashboard.status.vehicles:Present Vehicles`,
    statusPeople: $localize`:@@dashboard.status.people:Present People`,
    statusKeys: $localize`:@@dashboard.status.keys:Distributed Keys`,
    statusEmptyVehicles: $localize`:@@dashboard.status.emptyVehicles:No vehicles inside`,
    statusEmptyPeople: $localize`:@@dashboard.status.emptyPeople:No one inside`,
    statusEmptyKeys: $localize`:@@dashboard.status.emptyKeys:No keys distributed`,
    statusViaFoot: $localize`:@@dashboard.status.viaFoot:On foot`,
    statusViaVehicle: $localize`:@@dashboard.status.viaVehicle:By vehicle`,
    statusUnknownDriver: $localize`:@@dashboard.status.unknownDriver:Driver not recorded`,
  };

  /** Localized user-type labels surfaced in the key dialogs' user dropdown. */
  private readonly keyUserType = {
    person: $localize`:@@field.person:Person`,
    employee: $localize`:@@userType.employee:Employee`,
    company: $localize`:@@userType.company:Company`,
  };

  protected readonly latestGateEvents = signal<AccessRow[]>([]);
  /** IDs of vehicles currently inside, used to gate ingress/egress in the vehicle dialog. */
  protected readonly insideVehicleIds = signal<Set<string>>(new Set());
  /** IDs of people currently inside, used to gate ingress/egress in the user dialog. */
  protected readonly insideUserIds = signal<Set<string>>(new Set());
  protected readonly lastUpdatedAt = signal('');

  // Current-status lists (who/what is inside right now) fed by the summary endpoint.
  protected readonly presentVehicles = signal<PresentVehicle[]>([]);
  protected readonly presentPeople = signal<PresentPerson[]>([]);
  protected readonly distributedKeys = signal<DistributedKey[]>([]);

  /** Status rows with a freshly-computed relative "since" label for display. */
  protected readonly presentVehicleRows = computed(() =>
    this.presentVehicles().map((v) => ({ ...v, sinceLabel: this.formatRelativeTime(v.since) })),
  );
  protected readonly presentPeopleRows = computed(() =>
    this.presentPeople().map((p) => ({ ...p, sinceLabel: this.formatRelativeTime(p.since) })),
  );
  protected readonly distributedKeyRows = computed(() =>
    this.distributedKeys().map((k) => ({ ...k, sinceLabel: this.formatRelativeTime(k.since) })),
  );

  /** Per-direction glow trigger, pulsed briefly when a fresh realtime event lands on a gate card. */
  protected readonly gateFlash = signal<Record<GateDirection, boolean>>({
    in: false,
    checkpoint: false,
    out: false,
  });

  protected readonly vehicleRows = computed(() => {
    return this.latestGateEvents()
      .filter(row => row.accessType === 'vehicle')
      .sort((a, b) => this.toTimestamp(b.createdAt) - this.toTimestamp(a.createdAt))
      .slice(0, 8)
      .map(row => ({
        ...row,
        eventTime: this.formatRelativeTime(row.createdAt),
      }));
  });

  protected readonly userRows = computed(() => {
    return this.latestGateEvents()
      .filter(row => row.accessType === 'user')
      .sort((a, b) => this.toTimestamp(b.createdAt) - this.toTimestamp(a.createdAt))
      .slice(0, 8)
      .map(row => ({
        ...row,
        eventTime: this.formatRelativeTime(row.createdAt),
      }));
  });

  protected readonly lastDirectionGateCards = computed<LastDirectionGateCard[]>(() => {
    const latestByDirection: Record<GateDirection, AccessRow | null> = {
      in: null,
      checkpoint: null,
      out: null,
    };

    const latestTimestampByDirection: Record<GateDirection, number> = {
      in: 0,
      checkpoint: 0,
      out: 0,
    };

    for (const row of this.latestGateEvents()) {
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
        placeholderReason: $localize`:@@dashboard.gate.waitIngress:Waiting for the first ingress vehicle event.`,
        event: latestByDirection.in,
      },
      {
        direction: 'checkpoint',
        title: $localize`:@@direction.checkpoint:Checkpoint`,
        placeholderReason: $localize`:@@dashboard.gate.waitCheckpoint:Waiting for the first checkpoint vehicle event.`,
        event: latestByDirection.checkpoint,
      },
      {
        direction: 'out',
        title: $localize`:@@direction.egress:Egress`,
        placeholderReason: $localize`:@@dashboard.gate.waitEgress:Waiting for the first egress vehicle event.`,
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
  protected readonly suggestedGates = signal<GateOption[]>([]);
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
  private periodicConsistencyTimer: ReturnType<typeof window.setInterval> | null = null;
  private readonly periodicConsistencyMs = 30000;
  private readonly gateFlashTimers: Record<GateDirection, ReturnType<typeof window.setTimeout> | null> = {
    in: null,
    checkpoint: null,
    out: null,
  };
  /** Kept a touch longer than the CSS animation so the class lingers until the glow settles. */
  private readonly gateFlashDurationMs = 1600;

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
    });

    // Re-attempt realtime subscription when network connectivity returns.
    this.onlineListener = () => {
      this.setupRealtimeSubscriptions();
      this.triggerAccessRefresh();
    };
    window.addEventListener('online', this.onlineListener);

    // Rebind subscriptions when the tab becomes active again.
    this.visibilityListener = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      this.setupRealtimeSubscriptions();
      this.triggerAccessRefresh();
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
    this.clearGateFlashTimers();

    this.clearRealtimeSubscriptions();
  }

  private clearGateFlashTimers(): void {
    for (const direction of Object.keys(this.gateFlashTimers) as GateDirection[]) {
      const timer = this.gateFlashTimers[direction];
      if (timer !== null) {
        window.clearTimeout(timer);
        this.gateFlashTimers[direction] = null;
      }
    }
  }

  /**
   * Briefly glows the gate card for the given direction. Resets on the current frame and
   * re-applies on the next so rapid back-to-back events on the same card restart the animation.
   */
  private flashGateCard(direction: GateDirection): void {
    const existingTimer = this.gateFlashTimers[direction];
    if (existingTimer !== null) {
      window.clearTimeout(existingTimer);
      this.gateFlashTimers[direction] = null;
    }

    this.gateFlash.update((state) => ({ ...state, [direction]: false }));

    window.requestAnimationFrame(() => {
      this.ngZone.run(() => {
        this.gateFlash.update((state) => ({ ...state, [direction]: true }));

        this.gateFlashTimers[direction] = window.setTimeout(() => {
          this.ngZone.run(() => {
            this.gateFlash.update((state) => ({ ...state, [direction]: false }));
          });
          this.gateFlashTimers[direction] = null;
        }, this.gateFlashDurationMs);
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
      gate: null,
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

  protected setRoomSelection(option: QuickActionDialogOption | null): void {
    this.patchQuickActionFormState({ room: option as RoomOption | null });
  }

  protected setQuickActionReason(reason: string): void {
    this.patchQuickActionFormState({ reason });
  }

  protected quickAction(action: QuickActionDialogType): void {
    this.resetQuickActionFormState();
    this.setDialogVisibility(action, true);
    if (action === 'vehicle_access' || action === 'user_access') {
      // The gate is picked from a select button, so load all gates and default
      // to the first one.
      this.loadAccessGateOptions();
    }
  }

  private async loadAccessGateOptions(): Promise<void> {
    try {
      const records = await this.pb.collection('gates').getFullList<GateSearchRecord>({ sort: 'name' });
      const options = records.map((record) => ({
        id: record.id,
        displayName: record.name || 'Unknown gate',
        direction: record.direction,
      }));
      this.suggestedGates.set(options);
      this.patchQuickActionFormState({ gate: options[0] ?? null });
    } catch (error) {
      console.error(error);
      this.suggestedGates.set([]);
    }
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

      // Over-fetch, then keep only people eligible for the chosen gate:
      // ingress → people currently out, egress → people currently inside,
      // checkpoint (or no gate yet) → no inside/outside constraint.
      const direction = this.gateDirectionKind(this.quickActionForm().gate);
      const inside = this.insideUserIds();
      const records = await this.pb.collection('users').getList<UserSearchRecord>(1, 30, options);
      const eligible = records.items.filter((record) => {
        if (direction === 'out') {
          return inside.has(record.id);
        }
        if (direction === 'in') {
          return !inside.has(record.id);
        }
        return true;
      });

      this.suggestedUsers.set(eligible.slice(0, 10).map((record) => {
        const email = (record.email || '').trim();
        const companyName = (record.name || '').trim();
        const firstName = (record.first_name || '').trim();
        const lastName = (record.last_name || '').trim();
        const fullName = `${firstName} ${lastName}`.trim();

        const base = record.user_type === 'company' && companyName
          ? `${companyName}${email ? ` (${email})` : ''}`
          : `${fullName || email || 'Unknown user'}${fullName && email ? ` (${email})` : ''}`;
        const displayName = `${base} · ${this.keyUserTypeLabel(record.user_type)}`;

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

  // Used by the key distribute/gather dialogs: a key may be handed to any user except admins.
  protected async searchEmployees(query: string): Promise<void> {
    try {
      const normalizedQuery = query.trim();
      const escapedQuery = this.escapeFilterValue(normalizedQuery);
      const filter = `role != "admin"${escapedQuery ? ` && (first_name ~ "${escapedQuery}" || last_name ~ "${escapedQuery}" || email ~ "${escapedQuery}" || name ~ "${escapedQuery}")` : ''}`;
      const options = { filter };

      const records = await this.pb.collection('users').getList<UserSearchRecord>(1, 10, options);
      this.suggestedUsers.set(records.items.map((record) => this.buildKeyUserOption(record)));
    } catch (error) {
      console.error(error);
    }
  }

  /** Builds a key-dialog user option, surfacing the user's type alongside their name. */
  private buildKeyUserOption(record: UserSearchRecord): UserOption {
    const email = (record.email || '').trim();
    const firstName = (record.first_name || '').trim();
    const lastName = (record.last_name || '').trim();
    const companyName = (record.name || '').trim();
    const type = record.user_type;

    const base = type === 'company'
      ? (companyName || email || 'Unknown user')
      : (`${firstName} ${lastName}`.trim() || email || 'Unknown user');
    const withEmail = type !== 'company' && email && base !== email ? `${base} (${email})` : base;

    return {
      id: record.id,
      displayName: `${withEmail} · ${this.keyUserTypeLabel(type)}`,
      email,
      user_type: type,
    };
  }

  private keyUserTypeLabel(type?: string): string {
    if (type === 'company') return this.keyUserType.company;
    if (type === 'employee') return this.keyUserType.employee;
    return this.keyUserType.person;
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

      // Over-fetch, then keep only vehicles eligible for the chosen gate:
      // ingress → vehicles currently out, egress → vehicles currently inside,
      // checkpoint (or no gate yet) → no inside/outside constraint.
      const direction = this.gateDirectionKind(this.quickActionForm().gate);
      const inside = this.insideVehicleIds();
      const records = await this.pb.collection('vehicles').getList<VehicleSearchRecord>(1, 30, options);
      const eligible = records.items.filter((record) => {
        if (direction === 'out') {
          return inside.has(record.id);
        }
        if (direction === 'in') {
          return !inside.has(record.id);
        }
        return true;
      });

      this.suggestedVehicles.set(eligible.slice(0, 10).map((record) => {
        const base = `${record.number || ''}${record.country ? ` - ${record.country}` : ''}`.trim() || 'Unknown vehicle';
        const ownerName = this.getUserDisplayName(record.expand?.owner);
        return {
          id: record.id,
          displayName: ownerName ? `${base} · ${ownerName}` : base,
          owner: record.owner || '',
        };
      }));
    } catch (error) {
      console.error(error);
    }
  }

  /** Normalizes a gate option's direction to the ingress/egress/checkpoint kind. */
  private gateDirectionKind(gate: GateOption | null): 'in' | 'out' | 'checkpoint' | '' {
    const direction = String(gate?.direction || '').toLowerCase();
    if (!direction) return '';
    if (direction === 'out' || direction === 'egress') return 'out';
    if (direction === 'checkpoint') return 'checkpoint';
    return 'in';
  }

  /** Vehicle-access dialog: gate drives eligibility, so changing it clears the vehicle. */
  protected onVehicleAccessGateChange(option: QuickActionDialogOption | null): void {
    this.patchQuickActionFormState({ gate: option as GateOption | null, vehicle: null });
    this.suggestedVehicles.set([]);
  }

  /** User-access dialog: gate drives eligibility, so changing it clears the user. */
  protected onUserAccessGateChange(option: QuickActionDialogOption | null): void {
    this.patchQuickActionFormState({ gate: option as GateOption | null, user: null });
    this.suggestedUsers.set([]);
  }

  // Distribute only offers rooms whose key is available; gather only offers rooms whose key is out.
  protected searchDistributableRooms(query: string): Promise<void> {
    return this.searchRoomsByKeyState(query, false);
  }

  protected searchDistributedRooms(query: string): Promise<void> {
    return this.searchRoomsByKeyState(query, true);
  }

  private async searchRoomsByKeyState(query: string, distributed: boolean): Promise<void> {
    try {
      const normalizedQuery = query.trim();
      const escapedQuery = this.escapeFilterValue(normalizedQuery);
      const base = `key_collected = ${distributed ? 'true' : 'false'}`;
      const filter = escapedQuery
        ? `${base} && (number ~ "${escapedQuery}" || name ~ "${escapedQuery}")`
        : base;

      const records = await this.pb.collection('rooms').getList<RoomSearchRecord>(1, 10, { filter });
      this.suggestedRooms.set(records.items.map((record) => ({
        id: record.id,
        displayName: `${record.number || ''}${record.name ? ` - ${record.name}` : ''}`.trim() || 'Unknown room',
      })));
    } catch (error) {
      console.error(error);
    }
  }

  /** Gather dialog: when a room is chosen, prefill the user who currently holds its key. */
  protected onCollectRoomSelected(option: QuickActionDialogOption | null): void {
    this.patchQuickActionFormState({ room: option as RoomOption | null, user: null });
    this.suggestedUsers.set([]);
    if (option) {
      this.prefillKeyHolder(option.id);
    }
  }

  private roomKeyHolderFilter(roomId: string): string {
    return `room = "${this.escapeFilterValue(roomId)}" && is_collecting = true && did_return_key = false && enabled = true`;
  }

  private async prefillKeyHolder(roomId: string): Promise<void> {
    try {
      // A room has at most one open distribution (the workflow prevents a second
      // and closes it on return), so no sort is needed — and this collection has
      // no `created` field to sort on anyway.
      const records = await this.pb.collection('room_key_events').getList(1, 1, {
        filter: this.roomKeyHolderFilter(roomId),
        expand: 'user',
        requestKey: null,
      });
      const holder = (records.items[0] as any)?.expand?.user;
      if (holder) {
        const option = this.buildKeyUserOption(holder);
        this.suggestedUsers.set([option]);
        this.patchQuickActionFormState({ user: option });
      }
    } catch (error) {
      console.error('Failed to prefill key holder', error);
    }
  }

  /** Authoritative check of whether a room's key is currently out. */
  private async isRoomKeyOut(roomId: string): Promise<boolean> {
    try {
      const room = await this.pb.collection('rooms').getOne<{ key_collected?: boolean }>(roomId, {
        fields: 'id,key_collected',
        requestKey: null,
      });
      return room.key_collected === true;
    } catch (error) {
      console.error('Failed to check room key state', error);
      return false;
    }
  }

  // Submit methods
  protected async submitVehicleAccess() {
    const formState = this.quickActionForm();

    try {
      if (!formState.vehicle || !formState.gate) {
        this.messageService.add({ severity: 'error', summary: this.msg.error, detail: this.msg.vehicleGateRequired });
        return;
      }

      const currentUser = this.authService.user();
      if (!currentUser?.id) {
        this.messageService.add({ severity: 'error', summary: this.msg.error, detail: this.msg.driverRequired });
        return;
      }

      // Enforce the gate rules: a vehicle inside can't enter again, and only a
      // vehicle inside can exit. Checkpoints don't change status, so they're exempt.
      const direction = this.gateDirectionKind(formState.gate);
      const vehicleInside = this.insideVehicleIds().has(formState.vehicle.id);
      if (direction === 'in' && vehicleInside) {
        this.messageService.add({ severity: 'error', summary: this.msg.error, detail: this.msg.vehicleAlreadyInside });
        return;
      }
      if (direction === 'out' && !vehicleInside) {
        this.messageService.add({ severity: 'error', summary: this.msg.error, detail: this.msg.vehicleNotInside });
        return;
      }

      // The driver is the vehicle's owner; the signed-in operator is recorded
      // separately as who made the entry.
      const driverUserId = (formState.vehicle['owner'] as string | undefined) || '';

      await this.pb.collection('accesses').create({
        access_type: 'vehicle',
        vehicle: formState.vehicle.id,
        driver_user: driverUserId,
        gate: formState.gate.id,
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
      if (!formState.user || !formState.gate) {
        this.messageService.add({ severity: 'error', summary: this.msg.error, detail: this.msg.userGateRequired });
        return;
      }

      // Enforce the gate rules: a person inside can't enter again, and only a person
      // inside can exit. Checkpoints don't change status, so they're exempt.
      const direction = this.gateDirectionKind(formState.gate);
      const userInside = this.insideUserIds().has(formState.user.id);
      if (direction === 'in' && userInside) {
        this.messageService.add({ severity: 'error', summary: this.msg.error, detail: this.msg.userAlreadyInside });
        return;
      }
      if (direction === 'out' && !userInside) {
        this.messageService.add({ severity: 'error', summary: this.msg.error, detail: this.msg.userNotInside });
        return;
      }

      const didLeave = this.isEgressGate(formState.gate);

      await this.pb.collection('accesses').create({
        access_type: 'user',
        user: formState.user.id,
        gate: formState.gate.id,
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

      // Only allow distribution when the room's key is not already out.
      if (await this.isRoomKeyOut(formState.room.id)) {
        this.messageService.add({ severity: 'error', summary: this.msg.error, detail: this.msg.keyAlreadyDistributed });
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
      this.triggerAccessRefresh();
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
      this.triggerAccessRefresh();
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

  private isEgressGate(gate: GateOption): boolean {
    const direction = String(gate?.direction || '').toLowerCase();
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
            this.triggerAccessRefresh();
          });
        }
      };

      const targets: Array<Promise<() => void>> = [
        this.pb.collection('accesses').subscribe('*', onAccessEvent, {
          expand: 'user,vehicle,driver_user,made_by_user,gate',
          requestKey: null,
        }),
        this.pb.collection('gates').subscribe('*', () => this.ngZone.run(() => this.triggerAccessRefresh())),
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

    this.latestGateEvents.update((existingRows) => {
      const nextRows = [
        mapped,
        ...existingRows.filter((row) => row.id !== mapped.id),
      ]
        .sort((a, b) => this.toTimestamp(b.createdAt) - this.toTimestamp(a.createdAt))
        .slice(0, 50);

      return nextRows;
    });

    // Gate cards track vehicle events per direction — glow the matching card as it refreshes.
    if (mapped.accessType === 'vehicle') {
      this.flashGateCard(mapped.direction);
    }

    this.lastUpdatedAt.set(new Date().toLocaleString());

    // Pull the authoritative status lists (present vehicles/people/keys) from the
    // server shortly after the event lands.
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

  private async loadDashboard(initialLoad: boolean): Promise<void> {
    if (initialLoad) {
      this.loading.set(true);
    }

    try {
      await this.loadAccessData(initialLoad);
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

        this.latestGateEvents.set(latestEvents);
        this.insideVehicleIds.set(new Set(summary.insideVehicleIds ?? []));
        this.insideUserIds.set(new Set(summary.insideUserIds ?? []));
        this.presentVehicles.set(summary.presentVehicles ?? []);
        this.presentPeople.set(summary.presentPeople ?? []);
        this.distributedKeys.set(summary.distributedKeys ?? []);
      } catch (summaryError) {
        console.warn('Dashboard summary unavailable, falling back to direct accesses query.', summaryError);

        const records = await this.pb.collection('accesses').getFullList<AccessRecord>({
          sort: '-created',
          expand: 'user,vehicle,driver_user,made_by_user,gate',
        });

        const enabledRecords = records.filter((record) => record.enabled !== false);

        // A subject is inside when its most recent ingress/egress event was an ingress;
        // checkpoints don't change status. Records are sorted newest-first, so the first
        // in/out event seen per vehicle/user is its current state.
        const seenVehicle = new Set<string>();
        const seenUser = new Set<string>();
        const insideVehicles = new Set<string>();
        const insideUsers = new Set<string>();
        const presentVehicles: PresentVehicle[] = [];
        const peopleById = new Map<string, PresentPerson>();
        const driverCandidates: Array<{ id: string; name: string; vehicle: string; since: string }> = [];
        for (const record of enabledRecords) {
          const direction = this.normalizeDirection(record.expand?.gate?.direction, !!record.did_leave);
          if (direction === 'checkpoint') {
            continue;
          }
          if (record.access_type === 'vehicle') {
            const id = record.vehicle;
            if (!id || seenVehicle.has(id)) {
              continue;
            }
            seenVehicle.add(id);
            if (direction === 'in') {
              insideVehicles.add(id);
              const since = this.getRecordCreatedAt(record);
              const driverId = record.driver_user || record.made_by_user || '';
              const driverName = this.getUserDisplayName(record.expand?.driver_user ?? record.expand?.made_by_user, driverId);
              const number = record.expand?.vehicle?.number || record.vehicle || id;
              presentVehicles.push({ id, number, driver: driverName, gate: record.expand?.gate?.name || record.gate || '', since });
              if (driverId) {
                driverCandidates.push({ id: driverId, name: driverName, vehicle: number, since });
              }
            }
          } else if (record.access_type === 'user') {
            const id = record.user;
            if (!id || seenUser.has(id)) {
              continue;
            }
            seenUser.add(id);
            if (direction === 'in') {
              insideUsers.add(id);
              peopleById.set(id, {
                id,
                name: this.getUserDisplayName(record.expand?.user, id),
                via: 'foot',
                vehicle: '',
                since: this.getRecordCreatedAt(record),
              });
            }
          }
        }

        // Vehicle drivers count as present people unless they also walked in.
        for (const d of driverCandidates) {
          if (!peopleById.has(d.id)) {
            peopleById.set(d.id, { id: d.id, name: d.name, via: 'vehicle', vehicle: d.vehicle, since: d.since });
          }
        }

        const bySince = (a: { since: string }, b: { since: string }) => this.toTimestamp(b.since) - this.toTimestamp(a.since);
        presentVehicles.sort(bySince);
        const presentPeople = Array.from(peopleById.values()).sort(bySince);

        const latestEvents = enabledRecords
          .slice()
          .sort((a, b) => this.toTimestamp(this.getRecordCreatedAt(b)) - this.toTimestamp(this.getRecordCreatedAt(a)))
          .slice(0, 50)
          .map((record) => this.mapAccessRecord(record));

        this.latestGateEvents.set(latestEvents);
        this.insideVehicleIds.set(insideVehicles);
        this.insideUserIds.set(insideUsers);
        this.presentVehicles.set(presentVehicles);
        this.presentPeople.set(presentPeople);
        // Distributed-key holders need a room_key_events lookup that only the summary
        // endpoint performs; on this degraded fallback the keys list stays empty.
        this.distributedKeys.set([]);
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
    const expandedGate = record.expand?.gate;

    const subject = accessType === 'vehicle'
      ? (expandedVehicle?.number || record.vehicle || 'Unknown vehicle')
      : this.getUserDisplayName(expandedUser, record.user);

    const actor = accessType === 'vehicle'
      ? this.getUserDisplayName(expandedDriver || expandedActor, record.driver_user || record.made_by_user)
      : this.getUserDisplayName(expandedActor, record.made_by_user || record.user);

    const createdAt = this.getRecordCreatedAt(record);

    const gateDirection = this.normalizeDirection(expandedGate?.direction, didLeave);

    return {
      id: record.id,
      accessType,
      subject: subject || (accessType === 'vehicle' ? 'Unknown vehicle' : 'Unknown person'),
      actor: actor || 'System',
      gate: expandedGate?.name || record.gate || 'Unknown gate',
      direction: gateDirection,
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

  protected cardThemeClass(direction: GateDirection): string {
    if (direction === 'out') {
      return 'gate-card-out';
    }

    if (direction === 'checkpoint') {
      return 'gate-card-checkpoint';
    }

    return 'gate-card-in';
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
