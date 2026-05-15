import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { PocketBaseService } from '../../../core/services/pocketbase.service';

type AccessTypeFilter = 'all' | 'vehicle' | 'user';
type DirectionFilter = 'all' | 'in' | 'out';

type AccessLogRow = {
  id: string;
  accessType: 'vehicle' | 'user';
  subject: string;
  actor: string;
  camera: string;
  direction: 'in' | 'out';
  didLeave: boolean;
  reason: string;
  createdAt: string;
  updatedAt: string;
};

type DashboardSummaryEvent = {
  id: string;
  accessType?: 'vehicle' | 'user';
  access_type?: 'vehicle' | 'user';
  subject?: string;
  actor?: string;
  camera?: string;
  direction?: 'in' | 'out';
  didLeave?: boolean;
  did_leave?: boolean;
  reason?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
};

type SortField = 'when' | 'accessType' | 'subject' | 'actor' | 'camera' | 'direction' | 'status' | 'reason';

@Component({
  selector: 'app-access-logs',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    TableModule,
    TagModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
  ],
  providers: [MessageService],
  templateUrl: './access-logs.html',
  styleUrls: ['./access-logs.scss'],
})
export class AccessLogs implements OnInit {
  protected readonly loading = signal(true);
  protected readonly logs = signal<AccessLogRow[]>([]);
  protected readonly searchQuery = signal('');
  protected readonly accessTypeFilter = signal<AccessTypeFilter>('all');
  protected readonly directionFilter = signal<DirectionFilter>('all');
  protected readonly sortField = signal<SortField>('when');
  protected readonly sortDirection = signal<'asc' | 'desc'>('desc');

  protected readonly accessTypeOptions = [
    { label: 'All Access Types', value: 'all' as const },
    { label: 'Vehicle', value: 'vehicle' as const },
    { label: 'Person', value: 'user' as const },
  ];

  protected readonly directionOptions = [
    { label: 'All Directions', value: 'all' as const },
    { label: 'Ingress', value: 'in' as const },
    { label: 'Egress', value: 'out' as const },
  ];

  protected readonly filteredLogs = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const accessTypeFilter = this.accessTypeFilter();
    const directionFilter = this.directionFilter();
    const sortField = this.sortField();
    const sortDirection = this.sortDirection();

    const rows = this.logs()
      .filter((row) => {
        if (accessTypeFilter !== 'all' && row.accessType !== accessTypeFilter) {
          return false;
        }

        if (directionFilter !== 'all' && row.direction !== directionFilter) {
          return false;
        }

        if (!query) {
          return true;
        }

        const haystack = [
          row.subject,
          row.actor,
          row.camera,
          row.reason,
          row.accessType,
          row.direction,
          row.didLeave ? 'outside' : 'inside',
          this.formatDateTime(row.createdAt),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(query);
      })
      .slice();

    const compareText = (a: string, b: string) => a.localeCompare(b);

    rows.sort((a, b) => {
      let result = 0;

      switch (sortField) {
        case 'when':
          result = this.toTimestamp(a.createdAt) - this.toTimestamp(b.createdAt);
          break;
        case 'accessType':
          result = compareText(a.accessType, b.accessType);
          break;
        case 'subject':
          result = compareText(a.subject, b.subject);
          break;
        case 'actor':
          result = compareText(a.actor, b.actor);
          break;
        case 'camera':
          result = compareText(a.camera, b.camera);
          break;
        case 'direction':
          result = compareText(a.direction, b.direction);
          break;
        case 'status':
          result = Number(a.didLeave) - Number(b.didLeave);
          break;
        case 'reason':
          result = compareText(a.reason, b.reason);
          break;
        default:
          result = 0;
      }

      return sortDirection === 'asc' ? result : -result;
    });

    return rows;
  });

  constructor(
    private pbService: PocketBaseService,
    private messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.loadAccessLogs();
  }

  protected async loadAccessLogs(): Promise<void> {
    this.loading.set(true);

    try {
      // Reuse the same backend summary source as the dashboard so visibility
      // is consistent across screens regardless of collection-level view rules.
      try {
        const summary = await this.pb.send('/api/dashboard/summary', { method: 'GET' });
        const events = Array.isArray(summary?.events) ? summary.events as DashboardSummaryEvent[] : [];

        if (events.length > 0) {
          this.logs.set(events.map((event) => this.mapSummaryEvent(event)));
          return;
        }
      } catch {
        // Fall back to direct collection query below.
      }

      let records: any[] = [];

      try {
        records = await this.pb.collection('accesses').getFullList<any>({
          sort: '-created',
          expand: 'user,vehicle,driver_user,made_by_user,camera',
        });
      } catch {
        records = await this.pb.collection('accesses').getFullList<any>({
          sort: '-created',
        });
      }

      this.logs.set(records.map((record) => this.mapAccessRecord(record)));
    } catch (error: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: error?.message || 'Failed to load access logs.',
      });
    } finally {
      this.loading.set(false);
    }
  }

  protected resetFilters(): void {
    this.searchQuery.set('');
    this.accessTypeFilter.set('all');
    this.directionFilter.set('all');
    this.sortField.set('when');
    this.sortDirection.set('desc');
  }

  protected toggleSort(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
      return;
    }

    this.sortField.set(field);
    this.sortDirection.set(field === 'when' ? 'desc' : 'asc');
  }

  protected getSortIcon(field: SortField): string {
    if (this.sortField() !== field) {
      return 'pi-sort-alt text-slate-400';
    }

    return this.sortDirection() === 'asc'
      ? 'pi-sort-amount-up-alt text-blue-600'
      : 'pi-sort-amount-down text-blue-600';
  }

  protected directionSeverity(direction: 'in' | 'out'): 'success' | 'danger' {
    return direction === 'in' ? 'success' : 'danger';
  }

  protected statusSeverity(didLeave: boolean): 'warn' | 'success' {
    return didLeave ? 'warn' : 'success';
  }

  protected accessTypeSeverity(accessType: 'vehicle' | 'user'): 'contrast' | 'info' {
    return accessType === 'vehicle' ? 'contrast' : 'info';
  }

  protected formatDateTime(value?: string): string {
    if (!value) {
      return '-';
    }

    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : '-';
  }

  private get pb() {
    return this.pbService.pb;
  }

  private toTimestamp(value?: string): number {
    const ts = Date.parse(value || '');
    return Number.isFinite(ts) ? ts : 0;
  }

  private mapAccessRecord(record: any): AccessLogRow {
    const accessType = record.access_type === 'vehicle' ? 'vehicle' : 'user';
    const direction: 'in' | 'out' = record.did_leave ? 'out' : 'in';

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

    const createdAt = record.created || record.created_at || '';
    const updatedAt = record.updated || record.updated_at || '';

    return {
      id: record.id,
      accessType,
      subject,
      actor: actor || 'System',
      camera: expandedCamera?.name || record.camera || 'Unknown camera',
      direction,
      didLeave: !!record.did_leave,
      reason: record.reason || '-',
      createdAt,
      updatedAt,
    };
  }

  private mapSummaryEvent(event: DashboardSummaryEvent): AccessLogRow {
    const accessType = event.accessType === 'vehicle' || event.access_type === 'vehicle' ? 'vehicle' : 'user';
    const didLeave = !!(event.didLeave ?? event.did_leave);
    const createdAt = event.createdAt || event.created_at || '';
    const updatedAt = event.updatedAt || event.updated_at || createdAt;

    return {
      id: event.id || `summary-${createdAt}-${Math.random().toString(36).slice(2)}`,
      accessType,
      subject: event.subject || (accessType === 'vehicle' ? 'Unknown vehicle' : 'Unknown person'),
      actor: event.actor || 'System',
      camera: event.camera || 'Unknown camera',
      direction: event.direction === 'out' ? 'out' : 'in',
      didLeave,
      reason: event.reason || '-',
      createdAt,
      updatedAt,
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
}
