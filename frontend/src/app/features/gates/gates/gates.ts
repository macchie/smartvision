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
import { GateTrigger, GateTriggerDialogComponent, createEmptyTrigger } from '../gate-trigger-dialog/gate-trigger-dialog.component';

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
  triggerCount?: number;
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
    TagModule,
    GateTriggerDialogComponent
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

  // Trigger management (buffered in the gate dialog, reconciled on save)
  protected readonly triggers = signal<GateTrigger[]>([]);
  private deletedTriggerIds: string[] = [];
  protected triggerDialogVisible = false;
  protected triggerDialogMode: 'create' | 'edit' = 'create';
  protected editingTrigger: GateTrigger | null = null;
  private editingTriggerIndex: number | null = null;
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
    triggerSaveFailed: $localize`:@@triggers.msg.saveFailed:Gate saved, but one or more triggers failed to save.`,
    typeFolder: $localize`:@@triggers.type.folder:Folder watch`,
    typeTcp: $localize`:@@triggers.type.tcp:TCP socket`,
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
      const [records, triggerCounts] = await Promise.all([
        this.pb.pb.collection('gates').getFullList<Gate>({ sort: '-id' }),
        this.loadTriggerCounts(),
      ]);
      this.gates.set(records.map(record => ({
        ...record,
        direction: this.normalizeDirection(record.direction),
        metadataText: this.stringifyMetadata(record.metadata),
        notes: record.notes ?? record.description ?? '',
        triggerCount: triggerCounts.get(record.id) ?? 0,
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
    this.triggers.set([]);
    this.deletedTriggerIds = [];
    this.dialogMode = 'create';
    this.dialogVisible = true;
  }

  protected async editGate(gate: Gate) {
    this.formState = {
      ...gate,
      notes: gate.notes ?? gate.description ?? '',
      direction: this.normalizeDirection(gate.direction),
      metadataText: this.stringifyMetadata(gate.metadata),
    };
    this.triggers.set([]);
    this.deletedTriggerIds = [];
    this.dialogMode = 'edit';
    this.dialogVisible = true;
    await this.loadTriggersFor(gate.id);
  }

  private async loadTriggerCounts(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    try {
      const records = await this.pb.pb.collection('gate_triggers').getFullList<{ gate: string }>({
        fields: 'gate',
      });
      for (const record of records) {
        counts.set(record.gate, (counts.get(record.gate) ?? 0) + 1);
      }
    } catch {
      // gate_triggers may be unavailable (e.g. before migration) — treat as none.
    }
    return counts;
  }

  private async loadTriggersFor(gateId: string): Promise<void> {
    try {
      const records = await this.pb.pb.collection('gate_triggers').getFullList<GateTrigger>({
        filter: `gate = "${gateId}"`,
        sort: 'name',
      });
      this.triggers.set(records.map(record => ({ ...createEmptyTrigger(), ...record })));
    } catch {
      this.triggers.set([]);
    }
  }

  protected openNewTrigger(): void {
    this.editingTrigger = createEmptyTrigger();
    this.editingTriggerIndex = null;
    this.triggerDialogMode = 'create';
    this.triggerDialogVisible = true;
  }

  protected editTrigger(trigger: GateTrigger, index: number): void {
    this.editingTrigger = { ...trigger };
    this.editingTriggerIndex = index;
    this.triggerDialogMode = 'edit';
    this.triggerDialogVisible = true;
  }

  protected removeTrigger(index: number): void {
    const current = this.triggers();
    const target = current[index];
    if (!target) {
      return;
    }
    if (target.id) {
      this.deletedTriggerIds.push(target.id);
    }
    this.triggers.set(current.filter((_, i) => i !== index));
  }

  protected onTriggerSaved(trigger: GateTrigger): void {
    const current = this.triggers().slice();
    if (this.editingTriggerIndex === null) {
      current.push(trigger);
    } else {
      current[this.editingTriggerIndex] = { ...current[this.editingTriggerIndex], ...trigger };
    }
    this.triggers.set(current);
    this.editingTrigger = null;
    this.editingTriggerIndex = null;
  }

  protected triggerTypeLabel(type: GateTrigger['type']): string {
    return type === 'tcp_socket' ? this.t.typeTcp : this.t.typeFolder;
  }

  protected triggerSummary(trigger: GateTrigger): string {
    if (trigger.type === 'tcp_socket') {
      return `${trigger.tcp_host || '0.0.0.0'}:${trigger.tcp_port ?? '-'}`;
    }
    return trigger.watch_folder || '-';
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

      let gateId: string;
      if (this.dialogMode === 'create') {
        const created = await this.pb.pb.collection('gates').create(payload);
        gateId = created.id;
        this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.created });
      } else {
        gateId = this.formState.id!;
        await this.pb.pb.collection('gates').update(gateId, payload);
        this.messageService.add({ severity: 'success', summary: this.t.success, detail: this.t.updated });
      }

      await this.reconcileTriggers(gateId);

      this.dialogVisible = false;
      this.loadGates();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: this.t.error, detail: e.message || this.t.saveFailed });
    } finally {
      this.saving.set(false);
    }
  }

  /** Persists trigger adds/edits/deletes buffered in the gate dialog. */
  private async reconcileTriggers(gateId: string): Promise<void> {
    const col = this.pb.pb.collection('gate_triggers');
    let failed = false;

    for (const id of this.deletedTriggerIds) {
      try {
        await col.delete(id);
      } catch {
        failed = true;
      }
    }

    for (const trigger of this.triggers()) {
      const payload = this.buildTriggerPayload(trigger, gateId);
      try {
        if (trigger.id) {
          await col.update(trigger.id, payload);
        } else {
          await col.create(payload);
        }
      } catch {
        failed = true;
      }
    }

    this.deletedTriggerIds = [];

    if (failed) {
      this.messageService.add({ severity: 'warn', summary: this.t.error, detail: this.t.triggerSaveFailed });
    }
  }

  private buildTriggerPayload(trigger: GateTrigger, gateId: string): Record<string, unknown> {
    const port = trigger.tcp_port === null || trigger.tcp_port === undefined || (trigger.tcp_port as unknown) === ''
      ? null
      : Number(trigger.tcp_port);

    return {
      gate: gateId,
      name: (trigger.name || '').trim(),
      type: trigger.type,
      enabled: trigger.enabled ?? true,
      plate_regex: (trigger.plate_regex || '').trim(),
      watch_folder: (trigger.watch_folder || '').trim(),
      file_extensions: (trigger.file_extensions || '').trim(),
      processed_action: trigger.processed_action || 'delete',
      processed_folder: (trigger.processed_folder || '').trim(),
      tcp_host: (trigger.tcp_host || '').trim(),
      tcp_port: Number.isFinite(port as number) ? port : null,
      tcp_delimiter: trigger.tcp_delimiter || '',
      notes: (trigger.notes || '').trim(),
    };
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

  /** Tag colour per direction: green ingress, orange checkpoint, red egress. */
  protected directionSeverity(direction: Gate['direction']): 'success' | 'warn' | 'danger' {
    switch (direction) {
      case 'out':
        return 'danger';
      case 'checkpoint':
        return 'warn';
      case 'in':
      default:
        return 'success';
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
