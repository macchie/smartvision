import { Component } from '@angular/core';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [ToastModule, ConfirmDialogModule],
  template: `
    <p-toast position="bottom-right"></p-toast>
    <p-confirmDialog [style]="{ width: '30rem', maxWidth: '95vw' }"></p-confirmDialog>
  `,
})
export class ToastComponent {}
