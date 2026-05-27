import { Component } from '@angular/core';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [ToastModule, ConfirmDialogModule],
  template: `
    <p-toast position="bottom-right" appendTo="body"></p-toast>
    <p-confirmDialog
      appendTo="body"
      [style]="{ width: '30rem', maxWidth: '95vw' }"
      [breakpoints]="{ '960px': '92vw', '640px': '96vw' }"
    ></p-confirmDialog>
  `,
})
export class ToastComponent {}
