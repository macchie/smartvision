import { Component, OnInit, computed, signal } from '@angular/core';
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
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { formatDateTime, resolveTimestamp } from '../../../shared/utils/date-time.utils';
import { compareBoolean, compareText, getSortIcon, toggleSortState } from '../../../shared/utils/sort.utils';

interface Camera {
  id: string;
  name: string;
  camera_id: string;
  direction: 'in' | 'out' | 'checkpoint';
  metadata?: unknown;
  metadataText?: string;
  notes?: string;
  description?: string;
  enabled?: boolean;
  created: string;
  updated: string;
  created_at?: string;
  updated_at?: string;
}

@Component({
  selector: 'app-cameras',
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
    SelectModule,
    TagModule
  ],
  templateUrl: './cameras.html',
  styleUrls: ['./cameras.scss']
})
export class Cameras implements OnInit {
  protected readonly cameras = signal<Camera[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly searchQuery = signal('');
  protected readonly sortField = signal<'name' | 'camera_id' | 'direction' | 'metadata' | 'enabled' | 'notes'>('name');
  protected readonly sortDirection = signal<'asc' | 'desc'>('asc');
  protected readonly filteredCameras = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const sortField = this.sortField();
    const sortDirection = this.sortDirection();
    const rows = this.cameras()
      .filter(camera => {
        if (!query) {
          return true;
        }

        const haystack = [
          camera.name,
          camera.camera_id,
          camera.direction,
          camera.metadataText,
          camera.notes,
          camera.description,
          camera.enabled ? 'yes enabled' : 'no disabled',
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
        case 'camera_id':
          result = compareText(a.camera_id || '', b.camera_id || '');
          break;
        case 'direction':
          result = compareText(a.direction || '', b.direction || '');
          break;
        case 'metadata':
          result = compareText(a.metadataText || '', b.metadataText || '');
          break;
        case 'enabled':
          result = compareBoolean(!!a.enabled, !!b.enabled);
          break;
        case 'notes':
          result = compareText(a.notes || a.description || '', b.notes || b.description || '');
          break;
        case 'name':
        default:
          result = compareText(a.name || '', b.name || '');
          break;
      }

      return sortDirection === 'asc' ? result : -result;
    });

    return rows;
  });

  // Dialog state
  protected dialogVisible = false;
  protected dialogMode: 'create' | 'edit' = 'create';
  protected formState: Partial<Camera> = { name: '', camera_id: '', direction: 'in', metadataText: '', notes: '' };
  protected readonly directionOptions = [
    { label: $localize`:@@cameras.opt.in:Entry (in)`, value: 'in' },
    { label: $localize`:@@cameras.opt.out:Exit (out)`, value: 'out' },
    { label: $localize`:@@direction.checkpoint:Checkpoint`, value: 'checkpoint' },
  ];

  /** Localized strings bound in the template or used in toasts/dialogs. */
  protected readonly t = {
    error: $localize`:@@common.error:Error`,
    success: $localize`:@@common.success:Success`,
    yes: $localize`:@@common.yes:Yes`,
    no: $localize`:@@common.no:No`,
    add: $localize`:@@cameras.add:Add Camera`,
    edit: $localize`:@@cameras.edit:Edit Camera`,
    loadFailed: $localize`:@@cameras.msg.loadFailed:Failed to load cameras.`,
    required: $localize`:@@cameras.msg.required:Camera name and Camera ID are required.`,
    metadataInvalid: $localize`:@@cameras.msg.metadataInvalid:Metadata must be valid JSON.`,
    created: $localize`:@@cameras.msg.created:Camera created.`,
    updated: $localize`:@@cameras.msg.updated:Camera updated.`,
    saveFailed: $localize`:@@cameras.msg.saveFailed:Failed to save camera.`,
    deleted: $localize`:@@cameras.msg.deleted:Camera deleted.`,
    deleteFailed: $localize`:@@cameras.msg.deleteFailed:Failed to delete camera.`,
    deleteHeader: $localize`:@@cameras.delete.header:Delete Camera`,
    deleteMessage: $localize`:@@cameras.delete.message:Are you sure you want to delete this camera?`,
    deleteLabel: $localize`:@@common.delete:Delete`,
    cancel: $localize`:@@common.cancel:Cancel`,
  };

  constructor(
    private pb: PocketBaseService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadCameras();
  }

  protected async loadCameras() {
    this.loading.set(true);
    try {
      const records = await this.pb.pb.collection('cameras').getFullList<Camera>({
        sort: '-id',
      });
      this.cameras.set(records.map(record => ({
        ...record,
        direction: this.normalizeDirection(record.direction),
        metadataText: this.stringifyMetadata(record.metadata),
        notes: record.notes ?? record.description ?? '',
        created: resolveTimestamp(record, 'created'),
        updated: resolveTimestamp(record, 'updated'),
      })));
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: this.t.error, detail: this.t.loadFailed });
    } finally {
      this.loading.set(false);
    }
  }

  protected openNewCamera() {
    this.formState = { name: '', camera_id: '', direction: 'in', metadataText: '', notes: '', enabled: true };
    this.dialogMode = 'create';
    this.dialogVisible = true;
  }

  protected editCamera(camera: Camera) {
    this.formState = {
      ...camera,
      notes: camera.notes ?? camera.description ?? '',
      direction: this.normalizeDirection(camera.direction),
      metadataText: this.stringifyMetadata(camera.metadata),
    };
    this.dialogMode = 'edit';
    this.dialogVisible = true;
  }

  protected hideDialog() {
    this.dialogVisible = false;
  }

  protected async saveCamera() {
    if (!this.formState.name?.trim() || !this.formState.camera_id?.trim()) {
      this.messageService.add({ severity: 'error', summary: this.t.error, detail: this.t.required });
      return;
    }

    this.saving.set(true);
    try {
      const metadataPayload = this.parseMetadata(this.formState.metadataText);
      if (metadataPayload === undefined) {
        this.messageService.add({ severity: 'error', summary: this.t.error, detail: this.t.metadataInvalid });
        return;
      }

      const payload = {
        name: this.formState.name.trim(),
        camera_id: this.formState.camera_id.trim(),
        direction: this.normalizeDirection(this.formState.direction),
        metadata: metadataPayload,
        notes: this.formState.notes?.trim() || '',
        enabled: this.formState.enabled ?? true,
      };

      if (this.dialogMode === 'create') {
        await this.pb.pb.collection('cameras').create(payload);
        this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.created });
      } else {
        await this.pb.pb.collection('cameras').update(this.formState.id!, payload);
        this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.updated });
      }
      this.dialogVisible = false;
      this.loadCameras();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: this.t.error, detail: e.message || this.t.saveFailed });
    } finally {
      this.saving.set(false);
    }
  }

  private stringifyMetadata(value: unknown): string {
    if (value === undefined || value === null || value === '') {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '';
    }
  }

  private parseMetadata(raw?: string): unknown {
    const source = (raw || '').trim();
    if (!source) {
      return null;
    }

    try {
      return JSON.parse(source);
    } catch {
      return undefined;
    }
  }

  protected deleteCameraConfirm(camera: Camera) {
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
          await this.pb.pb.collection('cameras').delete(camera.id);
          this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.deleted });
          this.loadCameras();
        } catch (e: any) {
          this.messageService.add({ severity: 'error', summary: this.t.error, detail: e.message || this.t.deleteFailed });
        }
      },
    });
  }

  protected toggleSort(field: 'name' | 'camera_id' | 'direction' | 'metadata' | 'enabled' | 'notes'): void {
    const nextSort = toggleSortState(this.sortField(), this.sortDirection(), field);
    this.sortField.set(nextSort.field);
    this.sortDirection.set(nextSort.direction);
  }

  protected getSortIcon(field: 'name' | 'camera_id' | 'direction' | 'metadata' | 'enabled' | 'notes'): string {
    return getSortIcon(this.sortField(), this.sortDirection(), field);
  }

  protected formatDateTime(value?: string): string {
    return formatDateTime(value);
  }

  protected directionLabel(direction: Camera['direction']): string {
    switch (direction) {
      case 'out':
        return $localize`:@@direction.egress:Egress`;
      case 'checkpoint':
        return $localize`:@@direction.checkpoint:Checkpoint`;
      case 'in':
      default:
        return $localize`:@@direction.ingress:Ingress`;
    }
  }

  private normalizeDirection(direction: unknown): Camera['direction'] {
    if (direction === 'out') {
      return 'out';
    }

    if (direction === 'checkpoint') {
      return 'checkpoint';
    }

    return 'in';
  }
}
