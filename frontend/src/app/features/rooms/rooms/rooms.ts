import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PocketBaseService } from '../../../core/services/pocketbase.service';
import { MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';

interface RoomGroup {
  id: string;
  name: string;
}

interface Room {
  id: string;
  number: string;
  name: string;
  notes?: string;
  description?: string;
  room_group?: string;
  group_id?: string;
  enabled?: boolean;
  expand?: {
    room_group?: RoomGroup;
    group_id?: RoomGroup;
  };
  created: string;
  updated: string;
}

type RoomGroupMap = Map<string, RoomGroup>;

@Component({
  selector: 'app-rooms',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    CardModule,
    SelectModule
  ],
  templateUrl: './rooms.html',
  styleUrls: ['./rooms.scss']
})
export class Rooms implements OnInit {
  protected readonly rooms = signal<Room[]>([]);
  protected readonly roomGroups = signal<RoomGroup[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  // Dialog state
  protected dialogVisible = false;
  protected dialogMode: 'create' | 'edit' = 'create';
  protected formState: Partial<Room> = { number: '', name: '', notes: '', room_group: '' };

  constructor(
    private pb: PocketBaseService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  protected async loadData() {
    this.loading.set(true);
    try {
      const [roomsResult, groupsResult] = await Promise.allSettled([
        this.pb.pb.collection('rooms').getFullList<Room>({
          sort: '-id',
          expand: 'room_group,group_id'
        }),
        this.pb.pb.collection('room_groups').getFullList<RoomGroup>({
          sort: 'name',
        })
      ]);

      const groups = groupsResult.status === 'fulfilled' ? groupsResult.value : [];
      this.roomGroups.set(groups);

      if (roomsResult.status !== 'fulfilled') {
        throw roomsResult.reason;
      }

      const groupsById: RoomGroupMap = new Map(groups.map(group => [group.id, group]));
      this.rooms.set(roomsResult.value.map(room => this.normalizeRoom(room, groupsById)));

      if (groupsResult.status !== 'fulfilled') {
        this.messageService.add({
          severity: 'warn',
          summary: 'Partial data loaded',
          detail: 'Rooms loaded, but room groups could not be loaded.',
        });
      }
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load rooms.' });
    } finally {
      this.loading.set(false);
    }
  }

  protected getRoomGroupName(room: Room): string {
    return room.expand?.room_group?.name
      || room.expand?.group_id?.name
      || this.roomGroups().find(group => group.id === (room.room_group ?? room.group_id))?.name
      || '';
  }

  protected openNewRoom() {
    this.formState = { number: '', name: '', notes: '', room_group: '', enabled: true };
    this.dialogMode = 'create';
    this.dialogVisible = true;
  }

  protected editRoom(room: Room) {
    this.formState = {
      ...room,
      room_group: room.room_group ?? room.group_id ?? '',
      notes: room.notes ?? room.description ?? ''
    };
    this.dialogMode = 'edit';
    this.dialogVisible = true;
  }

  protected hideDialog() {
    this.dialogVisible = false;
  }

  protected async saveRoom() {
    if (!this.formState.number?.trim() || !this.formState.name?.trim()) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Room number and name are required.' });
      return;
    }

    this.saving.set(true);
    try {
      const payload = {
        number: this.formState.number.trim(),
        name: this.formState.name.trim(),
        room_group: this.formState.room_group?.trim() || null,
        notes: this.formState.notes?.trim() || '',
        enabled: this.formState.enabled ?? true,
      };

      if (this.dialogMode === 'create') {
        await this.pb.pb.collection('rooms').create(payload);
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Room created.' });
      } else {
        await this.pb.pb.collection('rooms').update(this.formState.id!, payload);
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Room updated.' });
      }
      this.dialogVisible = false;
      this.loadData();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to save room.' });
    } finally {
      this.saving.set(false);
    }
  }

  protected async deleteRoomConfirm(room: Room) {
    if (confirm(`Are you sure you want to delete room "${room.name}"?`)) {
      try {
        await this.pb.pb.collection('rooms').delete(room.id);
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Room deleted.' });
        this.loadData();
      } catch (e: any) {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to delete room.' });
      }
    }
  }

  private normalizeRoom(room: Room, groupsById: RoomGroupMap): Room {
    const normalizedGroupId = room.room_group ?? room.group_id ?? '';
    const expandedGroup = room.expand?.room_group
      || room.expand?.group_id
      || (normalizedGroupId ? groupsById.get(normalizedGroupId) : undefined);

    return {
      ...room,
      room_group: normalizedGroupId,
      notes: room.notes ?? room.description ?? '',
      expand: {
        room_group: expandedGroup,
        group_id: room.expand?.group_id,
      },
    };
  }
}
