import { Directive, OnDestroy, input, output } from '@angular/core';

/**
 * Captures badge input inside a dialog without a dedicated scan popup, for a
 * faster flow: while `appBadgeScan` is truthy (bind it to the dialog's open
 * state) it listens document-wide for
 *
 *  1. **Keyboard-emulation scanners** — "keyboard wedge" hardware types the
 *     barcode as a burst of keystrokes terminated by Enter. We detect the burst
 *     by inter-key timing and swallow it (preventDefault/stopPropagation in the
 *     capture phase) so it never leaks into a focused search field.
 *  2. **Clipboard paste** — a pasted code is intercepted and emitted directly.
 *
 * Human typing (keys slower than the scanner threshold) is left untouched, so
 * the dialog's own autocomplete stays usable. The emitted value is the raw
 * decoded string — per `BadgeService` that is the PocketBase user id, which the
 * host resolves to a user.
 */
@Directive({
  selector: '[appBadgeScan]',
  standalone: true,
})
export class BadgeScanDirective implements OnDestroy {
  /** Only listen while truthy — bind to the host dialog's visibility. */
  readonly active = input(true, { alias: 'appBadgeScan' });
  /** Emits the decoded badge value (a user id) from a scan or paste. */
  readonly badgeScanned = output<string>();

  /** Max gap (ms) between keystrokes to still count as one scanner burst. */
  private static readonly SCANNER_MAX_GAP_MS = 50;
  /** Minimum burst length to treat an Enter-terminated sequence as a scan. */
  private static readonly MIN_SCAN_LENGTH = 3;

  private buffer = '';
  private lastKeyTime = 0;

  private readonly keydownHandler = (event: KeyboardEvent) => this.onKeydown(event);
  private readonly pasteHandler = (event: ClipboardEvent) => this.onPaste(event);

  constructor() {
    // Capture phase so we see (and can swallow) the event before the focused field.
    document.addEventListener('keydown', this.keydownHandler, true);
    document.addEventListener('paste', this.pasteHandler, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.keydownHandler, true);
    document.removeEventListener('paste', this.pasteHandler, true);
  }

  private onKeydown(event: KeyboardEvent): void {
    if (!this.active() || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const now = Date.now();
    const gap = now - this.lastKeyTime;
    this.lastKeyTime = now;

    if (event.key === 'Enter') {
      if (this.buffer.length >= BadgeScanDirective.MIN_SCAN_LENGTH) {
        event.preventDefault();
        event.stopPropagation();
        this.emit(this.buffer);
      }
      this.buffer = '';
      return;
    }

    if (event.key.length !== 1) {
      return;
    }

    if (gap > BadgeScanDirective.SCANNER_MAX_GAP_MS) {
      // Fresh keystroke — likely a human typing a search; let it through and
      // start a new buffer in case a scanner burst follows.
      this.buffer = event.key;
    } else {
      // Scanner-speed: accumulate and keep it out of the focused field.
      event.preventDefault();
      event.stopPropagation();
      this.buffer += event.key;
    }
  }

  private onPaste(event: ClipboardEvent): void {
    if (!this.active()) {
      return;
    }
    const text = (event.clipboardData?.getData('text') || '').trim();
    if (text) {
      event.preventDefault();
      event.stopPropagation();
      this.emit(text);
    }
  }

  private emit(raw: string): void {
    const value = (raw || '').trim();
    this.buffer = '';
    if (value) {
      this.badgeScanned.emit(value);
    }
  }
}
