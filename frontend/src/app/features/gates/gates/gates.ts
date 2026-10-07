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

interface Gate {
  id: string;
  name: string;
  gate_id: string;
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
  selector: 'app-gates',
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
  templateUrl: './gates.html',
  styleUrls: ['./gates.scss']
})
export class Gates implements OnInit {
  protected readonly gates = signal<Gate[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly searchQuery = signal('');
  protected readonly sortField = signal<'name' | 'gate_id' | 'direction' | 'metadata' | 'enabled' | 'notes'>('name');
  protected readonly sortDirection = signal<'asc' | 'desc'>('asc');
  protected readonly filteredGates = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const sortField = this.sortField();
    const sortDirection = this.sortDirection();
    const rows = this.gates()
      .filter(gate => {
        if (!query) {
          return true;
        }

        const haystack = [
          gate.name,
          gate.gate_id,
          gate.direction,
          gate.metadataText,
          gate.notes,
          gate.description,
          gate.enabled ? 'yes enabled' : 'no disabled',
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
        case 'gate_id':
          result = compareText(a.gate_id || '', b.gate_id || '');
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
  protected formState: Partial<Gate> = { name: '', gate_id: '', direction: 'in', metadataText: '', notes: '' };
  protected readonly directionOptions = [
    { label: $localize`:@@gates.opt.in:Entry (in)`, value: 'in' },
    { label: $localize`:@@gates.opt.out:Exit (out)`, value: 'out' },
    { label: $localize`:@@direction.checkpoint:Checkpoint`, value: 'checkpoint' },
  ];

  /** Localized strings bound in the template or used in toasts/dialogs. */
  protected readonly t = {
    error: $localize`:@@common.error:Error`,
    success: $localize`:@@common.success:Success`,
    yes: $localize`:@@common.yes:Yes`,
    no: $localize`:@@common.no:No`,
    add: $localize`:@@gates.add:Add Gate`,
    edit: $localize`:@@gates.edit:Edit Gate`,
    loadFailed: $localize`:@@gates.msg.loadFailed:Failed to load gates.`,
    required: $localize`:@@gates.msg.required:Gate name and Gate ID are required.`,
    metadataInvalid: $localize`:@@gates.msg.metadataInvalid:Metadata must be valid JSON.`,
    created: $localize`:@@gates.msg.created:Gate created.`,
    updated: $localize`:@@gates.msg.updated:Gate updated.`,
    saveFailed: $localize`:@@gates.msg.saveFailed:Failed to save gate.`,
    deleted: $localize`:@@gates.msg.deleted:Gate deleted.`,
    deleteFailed: $localize`:@@gates.msg.deleteFailed:Failed to delete gate.`,
    deleteHeader: $localize`:@@gates.delete.header:Delete Gate`,
    deleteMessage: $localize`:@@gates.delete.message:Are you sure you want to delete this gate?`,
    deleteLabel: $localize`:@@common.delete:Delete`,
    cancel: $localize`:@@common.cancel:Cancel`,
  };

  constructor(
    private pb: PocketBaseService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.loadGates();
  }

  protected async loadGates() {
    this.loading.set(true);
    try {
      const records = await this.pb.pb.collection('gates').getFullList<Gate>({
        sort: '-id',
      });
      this.gates.set(records.map(record => ({
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

  protected openNewGate() {
    this.formState = { name: '', gate_id: '', direction: 'in', metadataText: '', notes: '', enabled: true };
    this.dialogMode = 'create';
    this.dialogVisible = true;
  }

  protected editGate(gate: Gate) {
    this.formState = {
      ...gate,
      notes: gate.notes ?? gate.description ?? '',
      direction: this.normalizeDirection(gate.direction),
      metadataText: this.stringifyMetadata(gate.metadata),
    };
    this.dialogMode = 'edit';
    this.dialogVisible = true;
  }

  protected hideDialog() {
    this.dialogVisible = false;
  }

  protected async saveGate() {
    if (!this.formState.name?.trim() || !this.formState.gate_id?.trim()) {
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
        gate_id: this.formState.gate_id.trim(),
        direction: this.normalizeDirection(this.formState.direction),
        metadata: metadataPayload,
        notes: this.formState.notes?.trim() || '',
        enabled: this.formState.enabled ?? true,
      };

      if (this.dialogMode === 'create') {
        await this.pb.pb.collection('gates').create(payload);
        this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.created });
      } else {
        await this.pb.pb.collection('gates').update(this.formState.id!, payload);
        this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.updated });
      }
      this.dialogVisible = false;
      this.loadGates();
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

  protected deleteGateConfirm(gate: Gate) {
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
          await this.pb.pb.collection('gates').delete(gate.id);
          this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.deleted });
          this.loadGates();
        } catch (e: any) {
          this.messageService.add({ severity: 'error', summary: this.t.error, detail: e.message || this.t.deleteFailed });
        }
      },
    });
  }

  protected toggleSort(field: 'name' | 'gate_id' | 'direction' | 'metadata' | 'enabled' | 'notes'): void {
    const nextSort = toggleSortState(this.sortField(), this.sortDirection(), field);
    this.sortField.set(nextSort.field);
    this.sortDirection.set(nextSort.direction);
  }

  protected getSortIcon(field: 'name' | 'gate_id' | 'direction' | 'metadata' | 'enabled' | 'notes'): string {
    return getSortIcon(this.sortField(), this.sortDirection(), field);
  }

  protected formatDateTime(value?: string): string {
    return formatDateTime(value);
  }

  protected directionLabel(direction: Gate['direction']): string {
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

  private normalizeDirection(direction: unknown): Gate['direction'] {
    if (direction === 'out') {
      return 'out';
    }

    if (direction === 'checkpoint') {
      return 'checkpoint';
    }

    return 'in';
  }
}
