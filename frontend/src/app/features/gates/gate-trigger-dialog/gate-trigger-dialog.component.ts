import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';

export type GateTriggerType = 'folder_watch' | 'tcp_socket';

/** A single gate automation source. `id` is set once persisted in PocketBase. */
export interface GateTrigger {
  id?: string;
  gate?: string;
  name: string;
  type: GateTriggerType;
  enabled: boolean;
  plate_regex: string;
  // folder_watch
  watch_folder?: string;
  file_extensions?: string;
  processed_action?: 'delete' | 'move';
  processed_folder?: string;
  // tcp_socket
  tcp_host?: string;
  tcp_port?: number | null;
  tcp_delimiter?: string;
  notes?: string;
}

export function createEmptyTrigger(): GateTrigger {
  return {
    name: '',
    type: 'folder_watch',
    enabled: true,
    plate_regex: '',
    watch_folder: '',
    file_extensions: 'jpg,jpeg,png,bmp',
    processed_action: 'delete',
    processed_folder: '',
    tcp_host: '0.0.0.0',
    tcp_port: null,
    tcp_delimiter: '\\n',
    notes: '',
  };
}

@Component({
  selector: 'app-gate-trigger-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
  ],
  templateUrl: './gate-trigger-dialog.component.html',
})
export class GateTriggerDialogComponent {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();

  @Input() mode: 'create' | 'edit' = 'create';

  /** Parent passes the trigger to edit (a copy is held locally). */
  @Input() set trigger(value: GateTrigger | null) {
    this.form = value ? { ...createEmptyTrigger(), ...value } : createEmptyTrigger();
  }

  @Output() save = new EventEmitter<GateTrigger>();

  protected form: GateTrigger = createEmptyTrigger();
  protected submitted = false;

  protected readonly typeOptions = [
    { label: $localize`:@@triggers.type.folder:Folder watch`, value: 'folder_watch' },
    { label: $localize`:@@triggers.type.tcp:TCP socket`, value: 'tcp_socket' },
  ];

  protected readonly processedActionOptions = [
    { label: $localize`:@@triggers.action.delete:Delete file`, value: 'delete' },
    { label: $localize`:@@triggers.action.move:Move to folder`, value: 'move' },
  ];

  protected readonly t = {
    addHeader: $localize`:@@triggers.add:Add Trigger`,
    editHeader: $localize`:@@triggers.edit:Edit Trigger`,
  };

  protected onHide(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  protected onSubmit(): void {
    this.submitted = true;

    if (!this.form.name?.trim()) {
      return;
    }
    if (this.form.type === 'folder_watch' && !this.form.watch_folder?.trim()) {
      return;
    }
    if (this.form.type === 'tcp_socket' && !this.form.tcp_port) {
      return;
    }

    this.save.emit({ ...this.form });
    this.submitted = false;
    this.onHide();
  }
}
