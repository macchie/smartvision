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

interface Camera {
  id: string;
  name: string;
  camera_id: string;
  direction: 'in' | 'out';
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

    const compareText = (a: string, b: string) => a.localeCompare(b);
    const compareBoolean = (a: boolean, b: boolean) => Number(a) - Number(b);

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
    { label: 'Entry (in)', value: 'in' },
    { label: 'Exit (out)', value: 'out' },
  ];

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
        direction: record.direction === 'out' ? 'out' : 'in',
        metadataText: this.stringifyMetadata(record.metadata),
        notes: record.notes ?? record.description ?? '',
        created: record.created || record.created_at || '',
        updated: record.updated || record.updated_at || '',
      })));
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load cameras.' });
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
      direction: camera.direction === 'out' ? 'out' : 'in',
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
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Camera name and Camera ID are required.' });
      return;
    }

    this.saving.set(true);
    try {
      const metadataPayload = this.parseMetadata(this.formState.metadataText);
      if (metadataPayload === undefined) {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Metadata must be valid JSON.' });
        return;
      }

      const payload = {
        name: this.formState.name.trim(),
        camera_id: this.formState.camera_id.trim(),
        direction: this.formState.direction === 'out' ? 'out' : 'in',
        metadata: metadataPayload,
        notes: this.formState.notes?.trim() || '',
        enabled: this.formState.enabled ?? true,
      };

      if (this.dialogMode === 'create') {
        await this.pb.pb.collection('cameras').create(payload);
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Camera created.' });
      } else {
        await this.pb.pb.collection('cameras').update(this.formState.id!, payload);
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Camera updated.' });
      }
      this.dialogVisible = false;
      this.loadCameras();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to save camera.' });
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
      header: 'Delete Camera',
      message: `Are you sure you want to delete camera "${camera.name}"?`,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.pb.pb.collection('cameras').delete(camera.id);
          this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Camera deleted.' });
          this.loadCameras();
        } catch (e: any) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to delete camera.' });
        }
      },
    });
  }

  protected toggleSort(field: 'name' | 'camera_id' | 'direction' | 'metadata' | 'enabled' | 'notes'): void {
    if (this.sortField() === field) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
      return;
    }

    this.sortField.set(field);
    this.sortDirection.set('asc');
  }

  protected getSortIcon(field: 'name' | 'camera_id' | 'direction' | 'metadata' | 'enabled' | 'notes'): string {
    if (this.sortField() !== field) {
      return 'pi-sort-alt text-slate-400';
    }

    return this.sortDirection() === 'asc'
      ? 'pi-sort-amount-up-alt text-blue-600'
      : 'pi-sort-amount-down text-blue-600';
  }

  protected formatDateTime(value?: string): string {
    if (!value) {
      return '-';
    }

    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : '-';
  }
}
