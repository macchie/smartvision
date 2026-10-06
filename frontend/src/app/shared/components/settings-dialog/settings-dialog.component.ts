import { Component, computed, inject, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { ThemeService, AppTheme } from '../../../core/services/theme.service';
import { LocaleService } from '../../../core/services/locale.service';
import { UserConfigService } from '../../../core/services/user-config.service';
import { AppLanguage, SUPPORTED_LANGUAGES } from '../../../core/i18n/locales';

/**
 * User preferences dialog: switch UI language and colour scheme. Changes are
 * persisted to the signed-in user's `users_config` record. Changing the
 * language reloads the app so the matching translation bundle is applied.
 */
@Component({
  selector: 'app-settings-dialog',
  standalone: true,
  imports: [FormsModule, DialogModule, ButtonModule, SelectModule],
  template: `
    <p-dialog
      [header]="headerLabel"
      [visible]="visible()"
      (visibleChange)="onVisibleChange($event)"
      [modal]="true"
      styleClass="sv-dialog"
      appendTo="body"
      [breakpoints]="{ '960px': '82vw', '640px': '96vw' }"
    >
      <div class="mt-2 flex flex-col gap-6">
        <!-- Language -->
        <div class="flex flex-col gap-2">
          <label for="sv-settings-language" class="text-sm font-semibold" i18n="@@settings.language.label">Language</label>
          <p-select
            inputId="sv-settings-language"
            [options]="languageOptions"
            [ngModel]="selectedLanguage()"
            (ngModelChange)="selectedLanguage.set($event)"
            optionLabel="name"
            optionValue="code"
            appendTo="body"
            styleClass="w-full"
            [fluid]="true"
          >
            <ng-template let-opt pTemplate="selectedItem">
              <span class="flex items-center gap-2"><span>{{ opt.flag }}</span><span>{{ opt.label }}</span></span>
            </ng-template>
            <ng-template let-opt pTemplate="item">
              <span class="flex items-center gap-2"><span>{{ opt.flag }}</span><span>{{ opt.label }}</span></span>
            </ng-template>
          </p-select>
          <p class="text-xs text-slate-500" i18n="@@settings.language.hint">
            Changing the language reloads the app.
          </p>
        </div>

        <!-- Appearance -->
        <div class="flex flex-col gap-2">
          <span class="text-sm font-semibold" i18n="@@settings.appearance.label">Appearance</span>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="appearance-option flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors"
              [class.is-selected]="selectedTheme() === 'light'"
              (click)="selectedTheme.set('light')"
              [attr.aria-pressed]="selectedTheme() === 'light'"
            >
              <i class="pi pi-sun"></i><span i18n="@@settings.appearance.light">Light</span>
            </button>
            <button
              type="button"
              class="appearance-option flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors"
              [class.is-selected]="selectedTheme() === 'dark'"
              (click)="selectedTheme.set('dark')"
              [attr.aria-pressed]="selectedTheme() === 'dark'"
            >
              <i class="pi pi-moon"></i><span i18n="@@settings.appearance.dark">Dark</span>
            </button>
          </div>
        </div>
      </div>

      <ng-template pTemplate="footer">
        <p-button
          [label]="cancelLabel"
          severity="secondary"
          variant="text"
          (onClick)="close()"
        />
        <p-button
          [label]="saveLabel"
          [loading]="saving()"
          [disabled]="!hasChanges()"
          (onClick)="save()"
        />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .appearance-option {
        border-color: var(--sv-border-strong);
        background: var(--sv-input-bg);
        color: var(--sv-text);
      }
      .appearance-option:hover {
        background: var(--sv-accent-soft);
      }
      .appearance-option.is-selected {
        border-color: var(--sv-accent);
        background: var(--sv-accent-soft);
        color: var(--sv-text);
        box-shadow: 0 0 0 3px var(--sv-accent-soft);
      }
    `,
  ],
})
export class SettingsDialogComponent {
  private readonly theme = inject(ThemeService);
  private readonly locale = inject(LocaleService);
  private readonly userConfig = inject(UserConfigService);

  readonly visible = model(false);

  protected readonly languageOptions = SUPPORTED_LANGUAGES.map((l) => ({ ...l, name: l.label }));

  protected readonly selectedLanguage = signal<AppLanguage>(this.locale.current());
  protected readonly selectedTheme = signal<AppTheme>(this.theme.theme());
  protected readonly saving = signal(false);

  protected readonly headerLabel = $localize`:@@settings.title:Settings`;
  protected readonly saveLabel = $localize`:@@common.save:Save`;
  protected readonly cancelLabel = $localize`:@@common.cancel:Cancel`;

  protected readonly hasChanges = computed(
    () => this.selectedLanguage() !== this.locale.current() || this.selectedTheme() !== this.theme.theme(),
  );

  /** Reset the pending selections to the live values whenever the dialog opens. */
  protected onVisibleChange(open: boolean): void {
    if (open) {
      this.selectedLanguage.set(this.locale.current());
      this.selectedTheme.set(this.theme.theme());
    }
    this.visible.set(open);
  }

  protected close(): void {
    this.visible.set(false);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      if (this.selectedTheme() !== this.theme.theme()) {
        await this.userConfig.setTheme(this.selectedTheme());
      }
      // Must come last: switching language reloads the page.
      if (this.selectedLanguage() !== this.locale.current()) {
        await this.userConfig.setLanguage(this.selectedLanguage());
        return;
      }
      this.close();
    } finally {
      this.saving.set(false);
    }
  }
}
