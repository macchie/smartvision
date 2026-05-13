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

interface RoomGroup {
  id: string;
  name: string;
  notes?: string;
  description?: string;
  enabled?: boolean;
  created: string;
  updated: string;
}

@Component({
  selector: 'app-room-groups',
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
  templateUrl: './room-groups.html',
  styleUrls: ['./room-groups.scss']
})
export class RoomGroups implements OnInit {
  protected readonly roomGroups = signal<RoomGroup[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  // Dialog state
  protected dialogVisible = false;
  protected dialogMode: 'create' | 'edit' = 'create';
  protected formState: Partial<RoomGroup> = { name: '', notes: '' };

  constructor(
    private pb: PocketBaseService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadRoomGroups();
  }

  protected async loadRoomGroups() {
    this.loading.set(true);
    try {
      const records = await this.pb.pb.collection('room_groups').getFullList<RoomGroup>({
        sort: '-id',
      });
      this.roomGroups.set(records.map(record => ({
        ...record,
        notes: record.notes ?? record.description ?? '',
      })));
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load room groups.' });
    } finally {
      this.loading.set(false);
    }
  }

  protected openNewRoomGroup() {
    this.formState = { name: '', notes: '', enabled: true };
    this.dialogMode = 'create';
    this.dialogVisible = true;
  }

  protected editRoomGroup(group: RoomGroup) {
    this.formState = {
      ...group,
      notes: group.notes ?? group.description ?? ''
    };
    this.dialogMode = 'edit';
    this.dialogVisible = true;
  }

  protected hideDialog() {
    this.dialogVisible = false;
  }

  protected async saveRoomGroup() {
    if (!this.formState.name?.trim()) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Name is required.' });
      return;
    }

    this.saving.set(true);
    try {
      const payload = {
        name: this.formState.name.trim(),
        notes: this.formState.notes?.trim() || '',
        enabled: this.formState.enabled ?? true,
      };

      if (this.dialogMode === 'create') {
        await this.pb.pb.collection('room_groups').create(payload);
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Room Group created.' });
      } else {
        await this.pb.pb.collection('room_groups').update(this.formState.id!, payload);
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Room Group updated.' });
      }
      this.dialogVisible = false;
      this.loadRoomGroups();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to save room group.' });
    } finally {
      this.saving.set(false);
    }
  }

  protected deleteRoomGroupConfirm(group: RoomGroup) {
    this.confirmationService.confirm({
      header: 'Delete Room Group',
      message: `Are you sure you want to delete room group "${group.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.pb.pb.collection('room_groups').delete(group.id);
          this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Room Group deleted.' });
          this.loadRoomGroups();
        } catch (e: any) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to delete room group.' });
        }
      },
    });
  }
}
