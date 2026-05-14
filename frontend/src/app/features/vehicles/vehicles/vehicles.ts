import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PocketBaseService } from '../../../core/services/pocketbase.service';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';

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

  // Dialog state
  protected dialogVisible = false;
  protected dialogMode: 'create' | 'edit' = 'create';
  protected formState: Partial<Vehicle> = { number: '', country: '', notes: '', ownerRecord: null };

  constructor(
    private pb: PocketBaseService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
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
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load vehicles.' });
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
    this.suggestedOwners.set(vehicle.ownerRecord ? [vehicle.ownerRecord] : []);
    this.dialogMode = 'edit';
    this.dialogVisible = true;
  }

  protected hideDialog() {
    this.dialogVisible = false;
    this.suggestedOwners.set([]);
  }

  protected async searchOwners(event: AutoCompleteCompleteEvent) {
    try {
      const query = (event.query || '').trim();
      const escapedQuery = query.replace(/"/g, '\\"');
      const baseFilter = 'role = "regular" && (user_type = "person" || user_type = "company")';
      const queryFilter = query
        ? ` && (first_name ~ "${escapedQuery}" || last_name ~ "${escapedQuery}" || name ~ "${escapedQuery}" || email ~ "${escapedQuery}")`
        : '';
      const filter = `${baseFilter}${queryFilter}`;

      const records = await this.pb.pb.collection('users').getList(1, 10, {
        filter,
        sort: 'name,first_name,last_name,email',
      });

      this.suggestedOwners.set(
        records.items.map((record: any) => ({
          id: record.id,
          displayName: this.getOwnerDisplayName(record),
        })),
      );
    } catch {
      this.suggestedOwners.set([]);
    }
  }

  protected async saveVehicle() {
    if (!this.formState.number?.trim()) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Plate number is required.' });
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
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Vehicle created.' });
      } else {
        await this.pb.pb.collection('vehicles').update(this.formState.id!, payload);
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Vehicle updated.' });
      }
      this.dialogVisible = false;
      this.loadVehicles();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to save vehicle.' });
    } finally {
      this.saving.set(false);
    }
  }

  private getOwnerDisplayName(user: any): string {
    if (!user) {
      return '';
    }

    if (user.user_type === 'company') {
      return user.name?.trim() || user.email || 'Company';
    }

    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return fullName || user.name?.trim() || user.email || 'Person';
  }

  protected deleteVehicleConfirm(vehicle: Vehicle) {
    this.confirmationService.confirm({
      header: 'Delete Vehicle',
      message: `Are you sure you want to delete vehicle "${vehicle.number}"?`,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.pb.pb.collection('vehicles').delete(vehicle.id);
          this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Vehicle deleted.' });
          this.loadVehicles();
        } catch (e: any) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to delete vehicle.' });
        }
      },
    });
  }
}
