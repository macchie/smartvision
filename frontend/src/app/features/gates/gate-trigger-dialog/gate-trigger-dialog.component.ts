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

/** One slice of the test string, coloured by how it participates in the match. */
interface PreviewToken {
  text: string;
  kind: 'plain' | 'match' | 'capture';
}

interface RegexPreview {
  status: 'empty' | 'invalid' | 'no-match' | 'match';
  /** JS error message when the pattern does not compile. */
  error: string | null;
  /** True when the pattern is blank and the engine's default pattern is used. */
  usingDefault: boolean;
  tokens: PreviewToken[];
  /** The plate the engine would record (capture group 1 or whole match, normalized). */
  extracted: string | null;
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
    this.regexSample = '';
    this.previewCache = null;
  }

  @Output() save = new EventEmitter<GateTrigger>();

  protected form: GateTrigger = createEmptyTrigger();
  protected submitted = false;

  /** Ad-hoc sample the user types/pastes to test the regex. Never persisted. */
  protected regexSample = '';

  /** The engine's fallback pattern, mirrored from the backend trigger engine. */
  private static readonly DEFAULT_PLATE_PATTERN = '([A-Z0-9]{4,10})';

  // Memoize so repeated template reads in one change-detection pass run exec once.
  private previewCache: { regex: string; sample: string; result: RegexPreview } | null = null;

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

  /**
   * Live preview of what the plate regex captures from the test string, mirroring
   * the backend trigger engine: `new RegExp(pattern, 'i')` (default pattern when
   * blank), first match, capture group 1 (or whole match), normalized to
   * uppercase `[A-Z0-9]`. Memoized on (pattern, sample).
   */
  protected get regexPreview(): RegexPreview {
    const sample = this.regexSample ?? '';
    const raw = this.form.plate_regex ?? '';
    if (this.previewCache && this.previewCache.regex === raw && this.previewCache.sample === sample) {
      return this.previewCache.result;
    }
    const result = this.computePreview(raw, sample);
    this.previewCache = { regex: raw, sample, result };
    return result;
  }

  private computePreview(rawPattern: string, sample: string): RegexPreview {
    const trimmed = rawPattern.trim();
    const usingDefault = trimmed.length === 0;
    const pattern = usingDefault ? GateTriggerDialogComponent.DEFAULT_PLATE_PATTERN : trimmed;

    let regex: RegExp;
    try {
      // `d` flag exposes capture-group indices so we can highlight the exact slice.
      regex = new RegExp(pattern, 'id');
    } catch (err) {
      return { status: 'invalid', error: (err as Error).message, usingDefault, tokens: [], extracted: null };
    }

    if (!sample) {
      return { status: 'empty', error: null, usingDefault, tokens: [], extracted: null };
    }

    const match = regex.exec(sample);
    if (!match) {
      return { status: 'no-match', error: null, usingDefault, tokens: [{ text: sample, kind: 'plain' }], extracted: null };
    }

    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    const indices = (match as RegExpExecArray & { indices?: Array<[number, number] | undefined> }).indices;
    const hasGroup = match[1] !== undefined && match[1] !== null && !!indices?.[1];
    const [capStart, capEnd] = hasGroup ? indices![1]! : [-1, -1];

    const tokens: PreviewToken[] = [];
    const push = (text: string, kind: PreviewToken['kind']) => {
      if (text) tokens.push({ text, kind });
    };

    push(sample.slice(0, matchStart), 'plain');
    if (hasGroup) {
      push(sample.slice(matchStart, capStart), 'match');
      push(sample.slice(capStart, capEnd), 'capture');
      push(sample.slice(capEnd, matchEnd), 'match');
    } else {
      // No capture group: the whole match is what gets extracted.
      push(sample.slice(matchStart, matchEnd), 'capture');
    }
    push(sample.slice(matchEnd), 'plain');

    const rawExtract = match[1] !== undefined && match[1] !== null ? match[1] : match[0];
    return { status: 'match', error: null, usingDefault, tokens, extracted: this.normalizePlate(rawExtract) };
  }

  private normalizePlate(raw: string): string {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  protected onHide(): void {
    this.visible = false;
    this.regexSample = '';
    this.previewCache = null;
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
