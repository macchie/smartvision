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

interface RoomGroup {
  id: string;
  name: string;
  notes?: string;
  description?: string;
  enabled?: boolean;
}

interface Room {
  id: string;
  number: string;
  name: string;
  notes?: string;
  description?: string;
  room_group?: string;
  roomGroupRecord?: { id: string; displayName: string } | null;
  group_id?: string;
  enabled?: boolean;
  key_collected?: boolean;
  expand?: {
    room_group?: RoomGroup;
    group_id?: RoomGroup;
  };
  created: string;
  updated: string;
}

interface RoomGroupRow {
  id: string;
  name: string;
  notes: string;
  enabled: boolean;
  rooms: Room[];
}

type RoomGroupMap = Map<string, RoomGroup>;

@Component({
  selector: 'app-rooms',
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
  templateUrl: './rooms.html',
  styleUrls: ['./rooms.scss']
})
export class Rooms implements OnInit {
  protected readonly roomGroups = signal<RoomGroup[]>([]);
  protected readonly suggestedRoomGroups = signal<Array<{ id: string; displayName: string }>>([]);
  protected readonly groupRows = signal<RoomGroupRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly savingGroup = signal(false);
  protected readonly savingRoom = signal(false);

  // Room Group dialog state
  protected groupDialogVisible = false;
  protected groupDialogMode: 'create' | 'edit' = 'create';
  protected groupFormState: Partial<RoomGroup> = { name: '', notes: '' };

  // Room dialog state
  protected roomDialogVisible = false;
  protected roomDialogMode: 'create' | 'edit' = 'create';
  protected roomFormState: Partial<Room> = { number: '', name: '', notes: '', room_group: '', roomGroupRecord: null };

  constructor(
    private pb: PocketBaseService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
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
          expand: 'room_group'
        }),
        this.pb.pb.collection('room_groups').getFullList<RoomGroup>({
          sort: 'name',
        })
      ]);

      const groups = groupsResult.status === 'fulfilled' ? groupsResult.value : [];
      this.roomGroups.set(groups);

      const groupsById: RoomGroupMap = new Map(groups.map(group => [group.id, group]));
      const normalizedRooms = roomsResult.status === 'fulfilled'
        ? roomsResult.value.map(room => this.normalizeRoom(room, groupsById))
        : [];
      this.groupRows.set(this.buildGroupRows(groups, normalizedRooms));

      if (groupsResult.status !== 'fulfilled') {
        this.messageService.add({
          severity: 'warn',
          summary: 'Partial data loaded',
          detail: 'Rooms loaded, but room groups could not be loaded.',
        });
      }

      if (roomsResult.status !== 'fulfilled') {
        this.messageService.add({
          severity: 'warn',
          summary: 'Partial data loaded',
          detail: 'Room groups loaded, but rooms could not be loaded.',
        });
      }
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load rooms.' });
    } finally {
      this.loading.set(false);
    }
  }

  protected openNewRoomGroup() {
    this.groupFormState = { name: '', notes: '', enabled: true };
    this.groupDialogMode = 'create';
    this.groupDialogVisible = true;
  }

  protected editRoomGroup(group: RoomGroupRow) {
    this.groupFormState = {
      id: group.id,
      name: group.name,
      notes: group.notes,
      enabled: group.enabled,
    };
    this.groupDialogMode = 'edit';
    this.groupDialogVisible = true;
  }

  protected hideRoomGroupDialog() {
    this.groupDialogVisible = false;
  }

  protected async saveRoomGroup() {
    if (!this.groupFormState.name?.trim()) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Room group name is required.' });
      return;
    }

    this.savingGroup.set(true);
    try {
      const payload = {
        name: this.groupFormState.name.trim(),
        notes: this.groupFormState.notes?.trim() || '',
        enabled: this.groupFormState.enabled ?? true,
      };

      if (this.groupDialogMode === 'create') {
        await this.pb.pb.collection('room_groups').create(payload);
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Room group created.' });
      } else {
        await this.pb.pb.collection('room_groups').update(this.groupFormState.id!, payload);
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Room group updated.' });
      }

      this.groupDialogVisible = false;
      this.loadData();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to save room group.' });
    } finally {
      this.savingGroup.set(false);
    }
  }

  protected deleteRoomGroupConfirm(group: RoomGroupRow) {
    this.confirmationService.confirm({
      header: 'Delete Room Group',
      message: `Are you sure you want to delete room group "${group.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.pb.pb.collection('room_groups').delete(group.id);
          this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Room group deleted.' });
          this.loadData();
        } catch (e: any) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to delete room group.' });
        }
      },
    });
  }

  protected openNewRoom(groupId = '') {
    const groupRecord = groupId
      ? this.roomGroups().find(group => group.id === groupId)
      : undefined;

    this.roomFormState = {
      number: '',
      name: '',
      notes: '',
      room_group: groupId,
      roomGroupRecord: groupRecord ? { id: groupRecord.id, displayName: groupRecord.name } : null,
      enabled: true,
      key_collected: false,
    };
    this.suggestedRoomGroups.set(groupRecord ? [{ id: groupRecord.id, displayName: groupRecord.name }] : []);
    this.roomDialogMode = 'create';
    this.roomDialogVisible = true;
  }

  protected editRoom(room: Room) {
    const groupRecord = room.expand?.room_group;
    this.roomFormState = {
      ...room,
      room_group: room.room_group ?? room.group_id ?? '',
      roomGroupRecord: groupRecord ? { id: groupRecord.id, displayName: groupRecord.name } : null,
      notes: room.notes ?? room.description ?? ''
    };
    this.suggestedRoomGroups.set(this.roomFormState.roomGroupRecord ? [this.roomFormState.roomGroupRecord] : []);
    this.roomDialogMode = 'edit';
    this.roomDialogVisible = true;
  }

  protected hideRoomDialog() {
    this.roomDialogVisible = false;
    this.suggestedRoomGroups.set([]);
  }

  protected async searchRoomGroups(event: AutoCompleteCompleteEvent) {
    const query = (event.query || '').trim().toLowerCase();
    const groups = this.roomGroups()
      .filter(group => {
        if (!query) return true;
        const haystack = `${group.name || ''} ${group.notes || ''}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 20)
      .map(group => ({ id: group.id, displayName: group.name }));

    this.suggestedRoomGroups.set(groups);
  }

  protected async saveRoom() {
    if (!this.roomFormState.number?.trim() || !this.roomFormState.name?.trim()) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Room number and name are required.' });
      return;
    }

    this.savingRoom.set(true);
    try {
      const payload = {
        number: this.roomFormState.number.trim(),
        name: this.roomFormState.name.trim(),
        room_group: this.roomFormState.roomGroupRecord?.id || null,
        notes: this.roomFormState.notes?.trim() || '',
        enabled: this.roomFormState.enabled ?? true,
      };

      if (this.roomDialogMode === 'create') {
        await this.pb.pb.collection('rooms').create(payload);
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Room created.' });
      } else {
        await this.pb.pb.collection('rooms').update(this.roomFormState.id!, payload);
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Room updated.' });
      }
      this.roomDialogVisible = false;
      this.loadData();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to save room.' });
    } finally {
      this.savingRoom.set(false);
    }
  }

  protected deleteRoomConfirm(room: Room) {
    this.confirmationService.confirm({
      header: 'Delete Room',
      message: `Are you sure you want to delete room "${room.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.pb.pb.collection('rooms').delete(room.id);
          this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Room deleted.' });
          this.loadData();
        } catch (e: any) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to delete room.' });
        }
      },
    });
  }

  protected getGroupRowCountLabel(group: RoomGroupRow): string {
    const count = group.rooms.length;
    return count === 1 ? '1 room' : `${count} rooms`;
  }

  private normalizeRoom(room: Room, groupsById: RoomGroupMap): Room {
    const normalizedGroupId = room.room_group ?? room.group_id ?? '';
    const expandedGroup = room.expand?.room_group
      || room.expand?.group_id
      || (normalizedGroupId ? groupsById.get(normalizedGroupId) : undefined);

    return {
      ...room,
      room_group: normalizedGroupId,
      roomGroupRecord: expandedGroup ? { id: expandedGroup.id, displayName: expandedGroup.name } : null,
      notes: room.notes ?? room.description ?? '',
      expand: {
        room_group: expandedGroup,
        group_id: room.expand?.group_id,
      },
    };
  }

  private buildGroupRows(groups: RoomGroup[], rooms: Room[]): RoomGroupRow[] {
    const rows: RoomGroupRow[] = groups
      .map(group => ({
        id: group.id,
        name: group.name,
        notes: (group.notes ?? group.description ?? '').trim(),
        enabled: !!group.enabled,
        rooms: [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const rowsById = new Map(rows.map(row => [row.id, row]));
    const ungroupedRooms: Room[] = [];

    for (const room of rooms) {
      const groupId = room.room_group ?? room.group_id ?? '';
      const row = groupId ? rowsById.get(groupId) : undefined;
      if (row) {
        row.rooms.push(room);
      } else {
        ungroupedRooms.push(room);
      }
    }

    for (const row of rows) {
      row.rooms.sort((a, b) => a.number.localeCompare(b.number));
    }

    if (ungroupedRooms.length > 0) {
      ungroupedRooms.sort((a, b) => a.number.localeCompare(b.number));
      rows.push({
        id: '__ungrouped__',
        name: 'Ungrouped Rooms',
        notes: 'Rooms that are not assigned to any room group.',
        enabled: true,
        rooms: ungroupedRooms,
      });
    }

    return rows;
  }
}
