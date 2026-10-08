import { Component, OnInit, computed, signal } from '@angular/core';
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
import { formatDateTime, resolveTimestamp } from '../../../shared/utils/date-time.utils';
import { getSortIcon, toggleSortState } from '../../../shared/utils/sort.utils';
import { BadgeScanDirective } from '../../../shared/directives/badge-scan.directive';

interface RoomGroup {
  id: string;
  name: string;
  notes?: string;
  description?: string;
  enabled?: boolean;
  created?: string;
  updated?: string;
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
  keyHolder?: string;
  expand?: {
    room_group?: RoomGroup;
    group_id?: RoomGroup;
  };
  created: string;
  updated: string;
  created_at?: string;
  updated_at?: string;
}

interface RoomGroupRow {
  id: string;
  name: string;
  notes: string;
  enabled: boolean;
  created: string;
  updated: string;
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
    TagModule,
    BadgeScanDirective
  ],
  templateUrl: './rooms.html',
  styleUrls: ['./rooms.scss']
})
export class Rooms implements OnInit {
  protected readonly roomGroups = signal<RoomGroup[]>([]);
  protected readonly suggestedRoomGroups = signal<Array<{ id: string; displayName: string }>>([]);
  protected readonly suggestedUsers = signal<Array<{ id: string; displayName: string }>>([]);
  protected readonly suggestedRooms = signal<Array<{ id: string; displayName: string }>>([]);
  protected readonly groupRows = signal<RoomGroupRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly savingGroup = signal(false);
  protected readonly savingRoom = signal(false);
  protected readonly roomKeyDialogVisible = signal(false);
  protected readonly searchQuery = signal('');
  protected readonly sortField = signal<'name' | 'type' | 'key' | 'enabled' | 'holder' | 'rooms'>('name');
  protected readonly sortDirection = signal<'asc' | 'desc'>('asc');
  protected readonly filteredGroupRows = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const sortField = this.sortField();
    const sortDirection = this.sortDirection();
    const rows = this.groupRows().map(group => ({
      ...group,
      rooms: group.rooms.slice(),
    }));

    const compareRoomBySort = (a: Room, b: Room) => {
      let result = 0;

      switch (sortField) {
        case 'key':
          result = Number(!!a.key_collected) - Number(!!b.key_collected);
          break;
        case 'enabled':
          result = Number(!!a.enabled) - Number(!!b.enabled);
          break;
        case 'holder':
          result = (a.keyHolder || '').localeCompare(b.keyHolder || '');
          break;
        case 'rooms':
          result = (a.number || '').localeCompare(b.number || '');
          break;
        case 'type':
          result = (a.name || '').localeCompare(b.name || '');
          break;
        case 'name':
        default:
          result = (a.number || '').localeCompare(b.number || '');
          break;
      }

      return sortDirection === 'asc' ? result : -result;
    };

    const filtered = rows
      .map(group => {
        const groupHaystack = `${group.name || ''} ${group.notes || ''}`.toLowerCase();
        const groupMatches = !query || groupHaystack.includes(query);

        const matchingRooms = group.rooms.filter(room => {
          if (!query) {
            return true;
          }

          if (groupMatches) {
            return true;
          }

          const roomHaystack = [
            room.number,
            room.name,
            room.notes,
            room.description,
            room.key_collected ? 'key collected' : 'key available',
            room.enabled ? 'enabled' : 'disabled',
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return roomHaystack.includes(query);
        });

        matchingRooms.sort(compareRoomBySort);

        return {
          ...group,
          rooms: matchingRooms,
          __groupMatches: groupMatches,
        };
      })
      .filter(group => group.__groupMatches || group.rooms.length > 0)
      .map(group => {
        const { __groupMatches, ...rest } = group;
        return rest;
      });

    filtered.sort((a, b) => {
      const getGroupSortKey = (group: RoomGroupRow): string | number => {
        switch (sortField) {
          case 'type':
            return group.id === '__ungrouped__' ? 'z_ungrouped' : 'a_group';
          case 'key': {
            const totalRooms = group.rooms.length;
            if (totalRooms === 0) {
              return -1;
            }
            const collected = group.rooms.filter(room => !!room.key_collected).length;
            return collected / totalRooms;
          }
          case 'enabled': {
            const totalRooms = group.rooms.length;
            if (totalRooms === 0) {
              return Number(!!group.enabled);
            }
            const enabledRooms = group.rooms.filter(room => !!room.enabled).length;
            return enabledRooms / totalRooms;
          }
          case 'holder':
            return '';
          case 'rooms':
            return group.rooms.length;
          case 'name':
          default:
            return group.name || '';
        }
      };

      const aKey = getGroupSortKey(a);
      const bKey = getGroupSortKey(b);

      let result = 0;
      if (typeof aKey === 'number' && typeof bKey === 'number') {
        result = aKey - bKey;
      } else {
        result = String(aKey).localeCompare(String(bKey));
      }

      if (a.id === '__ungrouped__' && b.id !== '__ungrouped__') {
        result = 1;
      } else if (b.id === '__ungrouped__' && a.id !== '__ungrouped__') {
        result = -1;
      }

      return sortDirection === 'asc' ? result : -result;
    });

    return filtered;
  });

  protected roomKeyDialogMode: 'distribute' | 'collect' = 'distribute';
  protected readonly roomKeyFormState = signal<{
    user: { id: string; displayName: string } | null;
    room: { id: string; displayName: string } | null;
    reason: string;
  }>({
    user: null,
    room: null,
    reason: '',
  });

  protected updateRoomKeyForm(patch: Partial<{
    user: { id: string; displayName: string } | null;
    room: { id: string; displayName: string } | null;
    reason: string;
  }>): void {
    this.roomKeyFormState.update(state => ({ ...state, ...patch }));
  }

  // Room Group dialog state
  protected groupDialogVisible = false;
  protected groupDialogMode: 'create' | 'edit' = 'create';
  protected groupFormState: Partial<RoomGroup> = { name: '', notes: '' };

  // Room dialog state
  protected roomDialogVisible = false;
  protected roomDialogMode: 'create' | 'edit' = 'create';
  protected roomFormState: Partial<Room> = { number: '', name: '', notes: '', room_group: '', roomGroupRecord: null };

  /** Localized strings bound in the template or used in toasts/dialogs. */
  protected readonly t = {
    error: $localize`:@@common.error:Error`,
    success: $localize`:@@common.success:Success`,
    cancel: $localize`:@@common.cancel:Cancel`,
    deleteLabel: $localize`:@@common.delete:Delete`,
    unnamed: $localize`:@@rooms.unnamed:Unnamed room`,
    collected: $localize`:@@rooms.key.collected:Collected`,
    available: $localize`:@@rooms.key.available:Available`,
    unitRoom: $localize`:@@rooms.unit.room:room`,
    unitRooms: $localize`:@@rooms.unit.rooms:rooms`,
    // Group dialog
    groupAdd: $localize`:@@rooms.group.add:Add Room Group`,
    groupEdit: $localize`:@@rooms.group.edit:Edit Room Group`,
    // Room dialog
    roomAdd: $localize`:@@rooms.addRoom:Add Room`,
    roomEdit: $localize`:@@rooms.editRoom:Edit Room`,
    // Room key dialog
    distributeKey: $localize`:@@dashboard.action.distributeKey:Distribute Key`,
    collectKey: $localize`:@@dashboard.action.collectKey:Collect Key`,
    distribute: $localize`:@@dashboard.action.distribute:Distribute`,
    collect: $localize`:@@dashboard.action.collect:Collect`,
    user: $localize`:@@field.user:User`,
    confirmReturn: $localize`:@@dashboard.dlg.confirmReturnByUser:Confirm Return by User`,
    scanUserSelected: $localize`:@@scan.userSelected:Badge matched; user selected.`,
    scanUserNotFound: $localize`:@@scan.userNotFound:No user found for the scanned badge.`,
    unknownEmployee: $localize`:@@common.unknownEmployee:Unknown employee`,
    person: $localize`:@@field.person:Person`,
    employee: $localize`:@@userType.employee:Employee`,
    company: $localize`:@@userType.company:Company`,
    alreadyDistributed: $localize`:@@key.alreadyDistributed:This room's key is already distributed.`,
    notDistributed: $localize`:@@key.notDistributed:This room's key is not currently distributed.`,
    // Toasts & confirms
    loadFailed: $localize`:@@rooms.msg.loadFailed:Failed to load rooms.`,
    partialTitle: $localize`:@@rooms.msg.partialTitle:Partial data loaded`,
    partialGroups: $localize`:@@rooms.msg.partialGroups:Rooms loaded, but room groups could not be loaded.`,
    partialRooms: $localize`:@@rooms.msg.partialRooms:Room groups loaded, but rooms could not be loaded.`,
    groupNameRequired: $localize`:@@rooms.msg.groupNameRequired:Room group name is required.`,
    groupCreated: $localize`:@@rooms.msg.groupCreated:Room group created.`,
    groupUpdated: $localize`:@@rooms.msg.groupUpdated:Room group updated.`,
    groupSaveFailed: $localize`:@@rooms.msg.groupSaveFailed:Failed to save room group.`,
    groupDeleteHeader: $localize`:@@rooms.group.delete.header:Delete Room Group`,
    groupDeleteMessage: $localize`:@@rooms.group.delete.message:Are you sure you want to delete this room group?`,
    groupDeleted: $localize`:@@rooms.msg.groupDeleted:Room group deleted.`,
    groupDeleteFailed: $localize`:@@rooms.msg.groupDeleteFailed:Failed to delete room group.`,
    roomRequired: $localize`:@@rooms.msg.roomRequired:Room number and name are required.`,
    roomCreated: $localize`:@@rooms.msg.roomCreated:Room created.`,
    roomUpdated: $localize`:@@rooms.msg.roomUpdated:Room updated.`,
    roomSaveFailed: $localize`:@@rooms.msg.roomSaveFailed:Failed to save room.`,
    roomDeleteHeader: $localize`:@@rooms.room.delete.header:Delete Room`,
    roomDeleteMessage: $localize`:@@rooms.room.delete.message:Are you sure you want to delete this room?`,
    roomDeleted: $localize`:@@rooms.msg.roomDeleted:Room deleted.`,
    roomDeleteFailed: $localize`:@@rooms.msg.roomDeleteFailed:Failed to delete room.`,
    userRoomRequired: $localize`:@@dashboard.msg.userRoomRequired:User and Room are required.`,
    keyDistributed: $localize`:@@dashboard.msg.keyDistributed:Key distributed.`,
    keyCollected: $localize`:@@dashboard.msg.keyCollected:Key collected.`,
    keyDistributeFailed: $localize`:@@dashboard.msg.keyDistributeFailed:Failed to distribute key.`,
    keyCollectFailed: $localize`:@@dashboard.msg.keyCollectFailed:Failed to collect key.`,
    ungroupedName: $localize`:@@rooms.ungrouped.name:Ungrouped Rooms`,
    ungroupedNotes: $localize`:@@rooms.ungrouped.notes:Rooms that are not assigned to any room group.`,
  };

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
      const [roomsResult, groupsResult, keyEventsResult] = await Promise.allSettled([
        this.pb.pb.collection('rooms').getFullList<Room>({
          sort: '-id',
          expand: 'room_group'
        }),
        this.pb.pb.collection('room_groups').getFullList<RoomGroup>({
          sort: 'name',
        }),
        // Open distributions — the user who currently holds each room's key.
        this.pb.pb.collection('room_key_events').getFullList<any>({
          filter: 'is_collecting = true && did_return_key = false && enabled = true',
          expand: 'user',
        })
      ]);

      const groups = groupsResult.status === 'fulfilled' ? groupsResult.value : [];
      this.roomGroups.set(groups);

      const keyHoldersByRoom = keyEventsResult.status === 'fulfilled'
        ? this.buildKeyHoldersByRoom(keyEventsResult.value)
        : new Map<string, string>();

      const groupsById: RoomGroupMap = new Map(groups.map(group => [group.id, group]));
      const normalizedRooms = roomsResult.status === 'fulfilled'
        ? roomsResult.value.map(room => this.normalizeRoom(room, groupsById, keyHoldersByRoom))
        : [];
      this.groupRows.set(this.buildGroupRows(groups, normalizedRooms));

      if (groupsResult.status !== 'fulfilled') {
        this.messageService.add({
          severity: 'warn',
          summary: this.t.partialTitle,
          detail: this.t.partialGroups,
        });
      }

      if (roomsResult.status !== 'fulfilled') {
        this.messageService.add({
          severity: 'warn',
          summary: this.t.partialTitle,
          detail: this.t.partialRooms,
        });
      }
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: this.t.error, detail: this.t.loadFailed });
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
      this.messageService.add({ severity: 'error', summary: this.t.error, detail: this.t.groupNameRequired });
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
        this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.groupCreated });
      } else {
        await this.pb.pb.collection('room_groups').update(this.groupFormState.id!, payload);
        this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.groupUpdated });
      }

      this.groupDialogVisible = false;
      this.loadData();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: this.t.error, detail: e.message || this.t.groupSaveFailed });
    } finally {
      this.savingGroup.set(false);
    }
  }

  protected deleteRoomGroupConfirm(group: RoomGroupRow) {
    this.confirmationService.confirm({
      header: this.t.groupDeleteHeader,
      message: this.t.groupDeleteMessage,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.t.deleteLabel,
      rejectLabel: this.t.cancel,
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.pb.pb.collection('room_groups').delete(group.id);
          this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.groupDeleted });
          this.loadData();
        } catch (e: any) {
          this.messageService.add({ severity: 'error', summary: this.t.error, detail: e.message || this.t.groupDeleteFailed });
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
      this.messageService.add({ severity: 'error', summary: this.t.error, detail: this.t.roomRequired });
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
        this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.roomCreated });
      } else {
        await this.pb.pb.collection('rooms').update(this.roomFormState.id!, payload);
        this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.roomUpdated });
      }
      this.roomDialogVisible = false;
      this.loadData();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: this.t.error, detail: e.message || this.t.roomSaveFailed });
    } finally {
      this.savingRoom.set(false);
    }
  }

  protected deleteRoomConfirm(room: Room) {
    this.confirmationService.confirm({
      header: this.t.roomDeleteHeader,
      message: this.t.roomDeleteMessage,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.t.deleteLabel,
      rejectLabel: this.t.cancel,
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.pb.pb.collection('rooms').delete(room.id);
          this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.roomDeleted });
          this.loadData();
        } catch (e: any) {
          this.messageService.add({ severity: 'error', summary: this.t.error, detail: e.message || this.t.roomDeleteFailed });
        }
      },
    });
  }

  protected openRoomKeyAction(room: Room): void {
    this.roomKeyDialogMode = room.key_collected ? 'collect' : 'distribute';

    const selectedRoom = {
      id: room.id,
      displayName: `${room.number || '-'}${room.name ? ' - ' + room.name : ''}`,
    };

    this.roomKeyFormState.set({
      user: null,
      room: selectedRoom,
      reason: '',
    });

    this.suggestedRooms.set([selectedRoom]);
    this.suggestedUsers.set([]);
    this.roomKeyDialogVisible.set(true);

    // When gathering, prefill the user who currently holds the key.
    if (this.roomKeyDialogMode === 'collect') {
      this.prefillKeyHolder(room.id);
    }
  }

  protected hideRoomKeyDialog(): void {
    this.roomKeyDialogVisible.set(false);
    this.roomKeyFormState.set({
      user: null,
      room: null,
      reason: '',
    });
    this.suggestedUsers.set([]);
    this.suggestedRooms.set([]);
  }

  protected getRoomKeyActionIcon(room: Room): string {
    return room.key_collected ? 'pi pi-check-circle' : 'pi pi-key';
  }

  protected getRoomKeyActionSeverity(room: Room): 'success' | 'warn' {
    return room.key_collected ? 'warn' : 'success';
  }

  protected async searchUsers(event: AutoCompleteCompleteEvent) {
    try {
      const query = (event.query || '').trim();
      const escapedQuery = this.escapeFilterValue(query);
      // A key may be handed to any user except admin accounts.
      const filterStr = `role != "admin"${escapedQuery ? ` && (first_name ~ "${escapedQuery}" || last_name ~ "${escapedQuery}" || email ~ "${escapedQuery}" || name ~ "${escapedQuery}")` : ''}`;
      const options = { filter: filterStr };

      const records = await this.pb.pb.collection('users').getList(1, 10, options);
      this.suggestedUsers.set(records.items.map(record => this.toUserOption(record)));
    } catch (e) {
      console.error(e);
    }
  }

  /** Resolve a scanned badge (user id) to the key holder and select them. */
  protected async resolveScannedKeyUser(code: string): Promise<void> {
    const id = (code || '').trim();
    if (!id) {
      return;
    }
    try {
      const record = await this.pb.pb.collection('users').getOne(id);
      const option = this.toUserOption(record);
      this.suggestedUsers.set([option]);
      this.updateRoomKeyForm({ user: option });
      this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.scanUserSelected });
    } catch (e) {
      console.error('Failed to resolve scanned badge', e);
      this.messageService.add({ severity: 'error', summary: this.t.error, detail: this.t.scanUserNotFound });
    }
  }

  /** Plain user name (no email/type decoration), used for compact table display. */
  private toUserName(record: any): string {
    const first = (record['first_name'] || '').trim();
    const last = (record['last_name'] || '').trim();
    const email = (record['email'] || '').trim();
    const company = (record['name'] || '').trim();
    const type = record['user_type'];

    return type === 'company'
      ? (company || email || this.t.unknownEmployee)
      : (`${first} ${last}`.trim() || email || this.t.unknownEmployee);
  }

  /** Builds a user autocomplete option that surfaces the user's type alongside their name. */
  private toUserOption(record: any): { id: string; displayName: string } {
    const email = (record['email'] || '').trim();
    const type = record['user_type'];

    const base = this.toUserName(record);
    const withEmail = type !== 'company' && email && base !== email ? `${base} (${email})` : base;

    return { id: record.id, displayName: `${withEmail} · ${this.userTypeLabel(type)}` };
  }

  private userTypeLabel(type: unknown): string {
    if (type === 'company') return this.t.company;
    if (type === 'employee') return this.t.employee;
    return this.t.person;
  }

  /** Finds the open distribution (key currently out) for a room and prefills its holder. */
  private async prefillKeyHolder(roomId: string): Promise<void> {
    try {
      // A room has at most one open distribution, so no sort is needed — and this
      // collection has no `created` field to sort on anyway.
      const records = await this.pb.pb.collection('room_key_events').getList(1, 1, {
        filter: `room = "${this.escapeFilterValue(roomId)}" && is_collecting = true && did_return_key = false && enabled = true`,
        expand: 'user',
      });
      const holder = (records.items[0] as any)?.expand?.user;
      if (holder) {
        const option = this.toUserOption(holder);
        this.suggestedUsers.set([option]);
        this.updateRoomKeyForm({ user: option });
      }
    } catch (e) {
      console.error('Failed to prefill key holder', e);
    }
  }

  /** Room autocomplete change in the key dialog — reset the user and, when gathering, prefill the holder. */
  protected onRoomKeyRoomChange(room: { id: string; displayName: string } | null): void {
    this.updateRoomKeyForm({ room, user: null });
    this.suggestedUsers.set([]);
    if (room && this.roomKeyDialogMode === 'collect') {
      this.prefillKeyHolder(room.id);
    }
  }

  protected async searchRooms(event: AutoCompleteCompleteEvent) {
    const query = (event.query || '').trim().toLowerCase();
    // Distribute only offers rooms whose key is available; gather only offers rooms whose key is out.
    const wantDistributed = this.roomKeyDialogMode === 'collect';
    const rooms = this.groupRows()
      .flatMap(group => group.rooms)
      .filter(room => !!room.key_collected === wantDistributed)
      .filter(room => {
        if (!query) {
          return true;
        }

        const haystack = `${room.number || ''} ${room.name || ''}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 20)
      .map(room => ({
        id: room.id,
        displayName: `${room.number || '-'}${room.name ? ' - ' + room.name : ''}`,
      }));

    this.suggestedRooms.set(rooms);
  }

  protected async submitRoomKeyAction(): Promise<void> {
    try {
      const state = this.roomKeyFormState();
      if (!state.user || !state.room) {
        this.messageService.add({ severity: 'error', summary: this.t.error, detail: this.t.userRoomRequired });
        return;
      }

      const isDistribute = this.roomKeyDialogMode === 'distribute';

      // Guard against distributing an already-out key, or gathering an available one.
      const roomRow = this.groupRows().flatMap(group => group.rooms).find(room => room.id === state.room!.id);
      if (roomRow) {
        if (isDistribute && roomRow.key_collected) {
          this.messageService.add({ severity: 'error', summary: this.t.error, detail: this.t.alreadyDistributed });
          return;
        }
        if (!isDistribute && !roomRow.key_collected) {
          this.messageService.add({ severity: 'error', summary: this.t.error, detail: this.t.notDistributed });
          return;
        }
      }

      await this.pb.pb.collection('room_key_events').create({
        room: state.room.id,
        user: state.user.id,
        is_collecting: isDistribute,
        did_return_key: !isDistribute,
        reason: state.reason,
        enabled: true,
      });

      this.messageService.add({
        severity: 'success',
        summary: this.t.success,
        detail: isDistribute ? this.t.keyDistributed : this.t.keyCollected,
      });

      this.hideRoomKeyDialog();
      this.loadData();
    } catch (e: any) {
      this.messageService.add({
        severity: 'error',
        summary: this.t.error,
        detail: e.message || (this.roomKeyDialogMode === 'distribute' ? this.t.keyDistributeFailed : this.t.keyCollectFailed),
      });
    }
  }

  protected getGroupRowCountLabel(group: RoomGroupRow): string {
    const count = group.rooms.length;
    return `${count} ${count === 1 ? this.t.unitRoom : this.t.unitRooms}`;
  }

  protected toggleSort(field: 'name' | 'type' | 'key' | 'enabled' | 'holder' | 'rooms'): void {
    const nextSort = toggleSortState(this.sortField(), this.sortDirection(), field);
    this.sortField.set(nextSort.field);
    this.sortDirection.set(nextSort.direction);
  }

  protected getSortIcon(field: 'name' | 'type' | 'key' | 'enabled' | 'holder' | 'rooms'): string {
    return getSortIcon(this.sortField(), this.sortDirection(), field);
  }

  protected formatDateTime(value?: string): string {
    return formatDateTime(value);
  }

  private escapeFilterValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /** Maps each room id to the display name of the user currently holding its key. */
  private buildKeyHoldersByRoom(events: any[]): Map<string, string> {
    const holders = new Map<string, string>();
    for (const event of events) {
      const roomId = event?.room;
      const holder = event?.expand?.user;
      if (roomId && holder && !holders.has(roomId)) {
        holders.set(roomId, this.toUserName(holder));
      }
    }
    return holders;
  }

  private normalizeRoom(room: Room, groupsById: RoomGroupMap, keyHoldersByRoom: Map<string, string>): Room {
    const normalizedGroupId = room.room_group ?? room.group_id ?? '';
    const expandedGroup = room.expand?.room_group
      || room.expand?.group_id
      || (normalizedGroupId ? groupsById.get(normalizedGroupId) : undefined);

    return {
      ...room,
      created: resolveTimestamp(room, 'created'),
      updated: resolveTimestamp(room, 'updated'),
      room_group: normalizedGroupId,
      roomGroupRecord: expandedGroup ? { id: expandedGroup.id, displayName: expandedGroup.name } : null,
      notes: room.notes ?? room.description ?? '',
      keyHolder: room.key_collected ? (keyHoldersByRoom.get(room.id) || '') : '',
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
        created: resolveTimestamp(group as any, 'created'),
        updated: resolveTimestamp(group as any, 'updated'),
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
        name: this.t.ungroupedName,
        notes: this.t.ungroupedNotes,
        enabled: true,
        created: '',
        updated: '',
        rooms: ungroupedRooms,
      });
    }

    return rows;
  }

}
