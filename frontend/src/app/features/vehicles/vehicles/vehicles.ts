import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PocketBaseService } from '../../../core/services/pocketbase.service';
import { OwnerOption, VehicleOwnerService } from '../../../core/services/vehicle-owner.service';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { formatDateTime, resolveTimestamp } from '../../../shared/utils/date-time.utils';
import { compareBoolean, compareText, getSortIcon, toggleSortState } from '../../../shared/utils/sort.utils';

interface Vehicle {
  id: string;
  number: string;
  country: string;
  owner?: string;
  ownerLabel?: string;
  ownerRecord?: { id: string; displayName: string } | null;
  notes?: string;
  note?: string;
  enabled?: boolean;
  created: string;
  updated: string;
  created_at?: string;
  updated_at?: string;
  createdAt?: string;
  updatedAt?: string;
}

@Component({
  selector: 'app-vehicles',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AutoCompleteModule,
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    CardModule,
    TagModule
  ],
  templateUrl: './vehicles.html',
  styleUrls: ['./vehicles.scss']
})
export class Vehicles implements OnInit {
  protected readonly vehicles = signal<Vehicle[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly suggestedOwners = signal<Array<{ id: string; displayName: string }>>([]);
  protected readonly searchQuery = signal('');
  protected readonly sortField = signal<'number' | 'country' | 'owner' | 'enabled'>('number');
  protected readonly sortDirection = signal<'asc' | 'desc'>('asc');
  protected readonly filteredVehicles = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const sortField = this.sortField();
    const sortDirection = this.sortDirection();
    const rows = this.vehicles()
      .filter(vehicle => {
        if (!query) {
          return true;
        }

        const haystack = [
          vehicle.number,
          vehicle.country,
          vehicle.ownerLabel,
          vehicle.notes,
          vehicle.note,
          vehicle.enabled ? 'yes enabled' : 'no disabled',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(query);
      })
      .slice();

    rows.sort((a, b) => {
      let result = 0;

      switch (sortField) {
        case 'country':
          result = compareText(a.country || '', b.country || '');
          break;
        case 'owner':
          result = compareText(a.ownerLabel || '', b.ownerLabel || '');
          break;
        case 'enabled':
          result = compareBoolean(!!a.enabled, !!b.enabled);
          break;
        case 'number':
        default:
          result = compareText(a.number || '', b.number || '');
          break;
      }

      return sortDirection === 'asc' ? result : -result;
    });

    return rows;
  });

  // Dialog state
  protected dialogVisible = false;
  protected dialogMode: 'create' | 'edit' = 'create';
  protected formState: Partial<Vehicle> = { number: '', country: '', notes: '', ownerRecord: null };
  /** Owner id a vehicle had when the edit dialog opened — used to cascade changes. */
  private editingOwnerId = '';

  // Quick "assign owner" dialog state (shown for vehicles with no owner yet).
  protected assignDialogVisible = false;
  protected readonly assigning = signal(false);
  protected assignTarget: Vehicle | null = null;
  protected assignOwnerRecord: OwnerOption | null = null;
  protected readonly assignSuggestions = signal<OwnerOption[]>([]);

  /** Localized strings bound in the template or used in toasts/dialogs. */
  protected readonly t = {
    error: $localize`:@@common.error:Error`,
    success: $localize`:@@common.success:Success`,
    yes: $localize`:@@common.yes:Yes`,
    no: $localize`:@@common.no:No`,
    add: $localize`:@@vehicles.add:Add Vehicle`,
    edit: $localize`:@@vehicles.edit:Edit Vehicle`,
    loadFailed: $localize`:@@vehicles.msg.loadFailed:Failed to load vehicles.`,
    plateRequired: $localize`:@@vehicles.msg.plateRequired:Plate number is required.`,
    created: $localize`:@@vehicles.msg.created:Vehicle created.`,
    updated: $localize`:@@vehicles.msg.updated:Vehicle updated.`,
    saveFailed: $localize`:@@vehicles.msg.saveFailed:Failed to save vehicle.`,
    deleted: $localize`:@@vehicles.msg.deleted:Vehicle deleted.`,
    deleteFailed: $localize`:@@vehicles.msg.deleteFailed:Failed to delete vehicle.`,
    deleteHeader: $localize`:@@vehicles.delete.header:Delete Vehicle`,
    deleteMessage: $localize`:@@vehicles.delete.message:Are you sure you want to delete this vehicle?`,
    deleteLabel: $localize`:@@common.delete:Delete`,
    cancel: $localize`:@@common.cancel:Cancel`,
    company: $localize`:@@userType.company:Company`,
    person: $localize`:@@field.person:Person`,
    assignOwner: $localize`:@@vehicles.assignOwner:Assign Owner`,
    ownerAssigned: $localize`:@@vehicles.msg.ownerAssigned:Owner assigned; related records updated.`,
    assignFailed: $localize`:@@vehicles.msg.assignFailed:Failed to assign owner.`,
  };

  constructor(
    private pb: PocketBaseService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private ownerService: VehicleOwnerService,
  ) {}

  ngOnInit(): void {
    this.loadVehicles();
  }

  protected async loadVehicles() {
    this.loading.set(true);
    try {
      let records: any[] = [];

      try {
        records = await this.pb.pb.collection('vehicles').getFullList<any>({
          sort: '-id',
          expand: 'owner',
        });
      } catch {
        // Fallback: when relation expansion is blocked or unavailable, still load vehicles.
        records = await this.pb.pb.collection('vehicles').getFullList<any>({
          sort: '-id',
        });
      }

      this.vehicles.set(records.map(record => {
        const expandedOwner = record.expand?.owner;
        return {
          ...record,
          notes: record.notes ?? record.note ?? '',
          created: resolveTimestamp(record, 'created'),
          updated: resolveTimestamp(record, 'updated'),
          ownerLabel: this.getOwnerDisplayName(expandedOwner),
          ownerRecord: expandedOwner
            ? {
                id: expandedOwner.id,
                displayName: this.getOwnerDisplayName(expandedOwner),
              }
            : null,
        };
      }));
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: this.t.error, detail: this.t.loadFailed });
    } finally {
      this.loading.set(false);
    }
  }

  protected openNewVehicle() {
    this.formState = { number: '', country: '', notes: '', enabled: true, ownerRecord: null };
    this.suggestedOwners.set([]);
    this.dialogMode = 'create';
    this.dialogVisible = true;
  }

  protected editVehicle(vehicle: Vehicle) {
    this.formState = {
      ...vehicle,
      notes: vehicle.notes ?? vehicle.note ?? '',
      ownerRecord: vehicle.ownerRecord ?? null,
    };
    this.editingOwnerId = vehicle.ownerRecord?.id ?? vehicle.owner ?? '';
    this.suggestedOwners.set(vehicle.ownerRecord ? [vehicle.ownerRecord] : []);
    this.dialogMode = 'edit';
    this.dialogVisible = true;
  }

  protected hideDialog() {
    this.dialogVisible = false;
    this.suggestedOwners.set([]);
  }

  protected async searchOwners(event: AutoCompleteCompleteEvent) {
    this.suggestedOwners.set(await this.ownerService.searchOwners(event.query || ''));
  }

  protected async saveVehicle() {
    if (!this.formState.number?.trim()) {
      this.messageService.add({ severity: 'error', summary: this.t.error, detail: this.t.plateRequired });
      return;
    }

    this.saving.set(true);
    try {
      const normalizedNumber = this.formState.number.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const payload = {
        number: normalizedNumber,
        country: this.formState.country?.trim().toUpperCase() || '',
        owner: this.formState.ownerRecord?.id || '',
        notes: this.formState.notes?.trim() || '',
        enabled: this.formState.enabled ?? true,
      };

      if (this.dialogMode === 'create') {
        await this.pb.pb.collection('vehicles').create(payload);
        this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.created });
      } else {
        await this.pb.pb.collection('vehicles').update(this.formState.id!, payload);
        // When the owner changed, cascade it onto the vehicle's access history so
        // the access log / dashboard reflect the new owner (not just the record).
        if (payload.owner && payload.owner !== this.editingOwnerId) {
          await this.ownerService.assignOwner(this.formState.id!, payload.owner);
        }
        this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.updated });
      }
      this.dialogVisible = false;
      this.loadVehicles();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: this.t.error, detail: e.message || this.t.saveFailed });
    } finally {
      this.saving.set(false);
    }
  }

  protected openAssignOwner(vehicle: Vehicle) {
    this.assignTarget = vehicle;
    this.assignOwnerRecord = null;
    this.assignSuggestions.set([]);
    this.assignDialogVisible = true;
  }

  protected async searchAssignOwners(event: AutoCompleteCompleteEvent) {
    this.assignSuggestions.set(await this.ownerService.searchOwners(event.query || ''));
  }

  protected async confirmAssignOwner() {
    const vehicleId = this.assignTarget?.id;
    const ownerId = this.assignOwnerRecord?.id;
    if (!vehicleId || !ownerId) {
      return;
    }

    this.assigning.set(true);
    try {
      await this.ownerService.assignOwner(vehicleId, ownerId);
      this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.ownerAssigned });
      this.assignDialogVisible = false;
      this.assignTarget = null;
      this.loadVehicles();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: this.t.error, detail: e?.message || this.t.assignFailed });
    } finally {
      this.assigning.set(false);
    }
  }

  private getOwnerDisplayName(user: any): string {
    if (!user) {
      return '';
    }

    if (user.user_type === 'company') {
      return user.name?.trim() || user.email || this.t.company;
    }

    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return fullName || user.name?.trim() || user.email || this.t.person;
  }

  protected deleteVehicleConfirm(vehicle: Vehicle) {
    this.confirmationService.confirm({
      header: this.t.deleteHeader,
      message: this.t.deleteMessage,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.t.deleteLabel,
      rejectLabel: this.t.cancel,
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.pb.pb.collection('vehicles').delete(vehicle.id);
          this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.deleted });
          this.loadVehicles();
        } catch (e: any) {
          this.messageService.add({ severity: 'error', summary: this.t.error, detail: e.message || this.t.deleteFailed });
        }
      },
    });
  }

  protected toggleSort(field: 'number' | 'country' | 'owner' | 'enabled'): void {
    const nextSort = toggleSortState(this.sortField(), this.sortDirection(), field);
    this.sortField.set(nextSort.field);
    this.sortDirection.set(nextSort.direction);
  }

  protected getSortIcon(field: 'number' | 'country' | 'owner' | 'enabled'): string {
    return getSortIcon(this.sortField(), this.sortDirection(), field);
  }

  protected formatDateTime(value?: string): string {
    return formatDateTime(value);
  }
}
