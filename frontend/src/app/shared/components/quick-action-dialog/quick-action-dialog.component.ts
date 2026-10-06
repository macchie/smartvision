import { Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';

export type QuickActionDialogOption = {
  id: string;
  displayName: string;
  [key: string]: unknown;
};

@Component({
  selector: 'app-quick-action-dialog',
  standalone: true,
  imports: [FormsModule, DialogModule, AutoCompleteModule, TextareaModule, ButtonModule],
  template: `
    <p-dialog
      [header]="title()"
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      [modal]="true"
      styleClass="sv-dialog"
      appendTo="body"
      [breakpoints]="{ '1280px': '68vw', '960px': '82vw', '640px': '96vw' }"
    >
      <div class="mt-2 flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <label [for]="primaryId()" class="text-sm font-semibold">{{ primaryLabel() }}</label>
          <p-autoComplete
            [inputId]="primaryId()"
            [ngModel]="primaryValue()"
            (ngModelChange)="primaryValue.set($event)"
            [suggestions]="primarySuggestions()"
            (completeMethod)="handlePrimarySearch($event)"
            field="displayName"
            optionLabel="displayName"
            dataKey="id"
            [placeholder]="primaryPlaceholder()"
            [dropdown]="true"
            [completeOnFocus]="primaryCompleteOnFocus()"
            appendTo="body"
            styleClass="w-full"
            [fluid]="true"
          >
            <ng-template let-item pTemplate="item">{{ item.displayName }}</ng-template>
          </p-autoComplete>
        </div>

        <div class="flex flex-col gap-2">
          <label [for]="secondaryId()" class="text-sm font-semibold">{{ secondaryLabel() }}</label>
          <p-autoComplete
            [inputId]="secondaryId()"
            [ngModel]="secondaryValue()"
            (ngModelChange)="secondaryValue.set($event)"
            [suggestions]="secondarySuggestions()"
            (completeMethod)="handleSecondarySearch($event)"
            field="displayName"
            optionLabel="displayName"
            dataKey="id"
            [placeholder]="secondaryPlaceholder()"
            [dropdown]="true"
            [completeOnFocus]="secondaryCompleteOnFocus()"
            appendTo="body"
            styleClass="w-full"
            [fluid]="true"
          >
            <ng-template let-item pTemplate="item">{{ item.displayName }}</ng-template>
          </p-autoComplete>
        </div>

        <div class="flex flex-col gap-2">
          <label [for]="reasonId()" class="text-sm font-semibold">{{ reasonLabel() }}</label>
          <textarea
            pTextarea
            [id]="reasonId()"
            [ngModel]="reason()"
            (ngModelChange)="reason.set($event)"
            rows="3"
            [placeholder]="reasonPlaceholder()"
            class="w-full"
          ></textarea>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <p-button [label]="cancelLabel()" severity="secondary" variant="text" (onClick)="visible.set(false)" />
          <p-button [label]="submitLabel()" [disabled]="submitDisabled()" (onClick)="submitAction()" />
        </div>
      </div>
    </p-dialog>
  `,
})
export class QuickActionDialogComponent {
  readonly title = input.required<string>();
  readonly visible = model(false);

  readonly primaryId = input.required<string>();
  readonly primaryLabel = input.required<string>();
  readonly primaryPlaceholder = input($localize`:@@common.search:Search...`);
  readonly primarySuggestions = input<QuickActionDialogOption[]>([]);
  readonly primaryCompleteOnFocus = input(true);
  readonly primaryValue = model<QuickActionDialogOption | null>(null);

  readonly secondaryId = input.required<string>();
  readonly secondaryLabel = input.required<string>();
  readonly secondaryPlaceholder = input($localize`:@@common.search:Search...`);
  readonly secondarySuggestions = input<QuickActionDialogOption[]>([]);
  readonly secondaryCompleteOnFocus = input(false);
  readonly secondaryValue = model<QuickActionDialogOption | null>(null);

  readonly reasonId = input.required<string>();
  readonly reasonLabel = input($localize`:@@common.reasonNotes:Reason / Notes`);
  readonly reasonPlaceholder = input($localize`:@@common.optionalNotes:Enter optional notes...`);
  readonly reason = model('');

  readonly submitLabel = input($localize`:@@common.save:Save`);
  readonly cancelLabel = input($localize`:@@common.cancel:Cancel`);
  readonly submitDisabled = input(false);

  readonly primarySearch = output<string>();
  readonly secondarySearch = output<string>();
  readonly submitted = output<void>();

  protected handlePrimarySearch(event: AutoCompleteCompleteEvent): void {
    this.primarySearch.emit((event.query || '').trim());
  }

  protected handleSecondarySearch(event: AutoCompleteCompleteEvent): void {
    this.secondarySearch.emit((event.query || '').trim());
  }

  protected submitAction(): void {
    this.submitted.emit();
  }
}
