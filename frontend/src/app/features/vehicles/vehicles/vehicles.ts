import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PocketBaseService } from '../../../core/services/pocketbase.service';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { CardModule } from 'primeng/card';

interface Vehicle {
  id: string;
  number: string;
  country: string;
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
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    CardModule
  ],
  templateUrl: './vehicles.html',
  styleUrls: ['./vehicles.scss']
})
export class Vehicles implements OnInit {
  protected readonly vehicles = signal<Vehicle[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  // Dialog state
  protected dialogVisible = false;
  protected dialogMode: 'create' | 'edit' = 'create';
  protected formState: Partial<Vehicle> = { number: '', country: '', notes: '' };

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
      const records = await this.pb.pb.collection('vehicles').getFullList<Vehicle>({
        sort: '-id',
      });
      this.vehicles.set(records.map(record => ({
        ...record,
        notes: record.notes ?? record.note ?? '',
      })));
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load vehicles.' });
    } finally {
      this.loading.set(false);
    }
  }

  protected openNewVehicle() {
    this.formState = { number: '', country: '', notes: '', enabled: true };
    this.dialogMode = 'create';
    this.dialogVisible = true;
  }

  protected editVehicle(vehicle: Vehicle) {
    this.formState = {
      ...vehicle,
      notes: vehicle.notes ?? vehicle.note ?? ''
    };
    this.dialogMode = 'edit';
    this.dialogVisible = true;
  }

  protected hideDialog() {
    this.dialogVisible = false;
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
