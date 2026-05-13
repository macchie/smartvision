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

interface Camera {
  id: string;
  name: string;
  camera_id: string;
  direction: 'in' | 'out';
  notes?: string;
  description?: string;
  enabled?: boolean;
  created: string;
  updated: string;
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
    SelectModule
  ],
  templateUrl: './cameras.html',
  styleUrls: ['./cameras.scss']
})
export class Cameras implements OnInit {
  protected readonly cameras = signal<Camera[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  // Dialog state
  protected dialogVisible = false;
  protected dialogMode: 'create' | 'edit' = 'create';
  protected formState: Partial<Camera> = { name: '', camera_id: '', direction: 'in', notes: '' };
  protected readonly directionOptions = [
    { label: 'Entry (in)', value: 'in' },
    { label: 'Exit (out)', value: 'out' },
  ];

  constructor(
    private pb: PocketBaseService,
    private messageService: MessageService
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
        notes: record.notes ?? record.description ?? '',
      })));
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load cameras.' });
    } finally {
      this.loading.set(false);
    }
  }

  protected openNewCamera() {
    this.formState = { name: '', camera_id: '', direction: 'in', notes: '', enabled: true };
    this.dialogMode = 'create';
    this.dialogVisible = true;
  }

  protected editCamera(camera: Camera) {
    this.formState = {
      ...camera,
      notes: camera.notes ?? camera.description ?? '',
      direction: camera.direction === 'out' ? 'out' : 'in',
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
      const payload = {
        name: this.formState.name.trim(),
        camera_id: this.formState.camera_id.trim(),
        direction: this.formState.direction === 'out' ? 'out' : 'in',
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

  protected async deleteCameraConfirm(camera: Camera) {
    if (confirm(`Are you sure you want to delete camera "${camera.name}"?`)) {
      try {
        await this.pb.pb.collection('cameras').delete(camera.id);
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Camera deleted.' });
        this.loadCameras();
      } catch (e: any) {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to delete camera.' });
      }
    }
  }
}
