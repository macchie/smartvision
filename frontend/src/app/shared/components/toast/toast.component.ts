import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (notificationService.notification(); as n) {
      <div class="fixed bottom-8 left-1/2 -translate-x-1/2 sm:left-auto sm:right-8 sm:translate-x-0 z-[200] flex items-center gap-2.5 pl-4 pr-5 py-3 rounded-2xl text-sm font-semibold shadow-2xl pb-safe animate-fade-in-up"
        [class]="n.type === 'error' ? 'bg-red-600 text-white shadow-red-600/25' : n.type === 'info' ? 'bg-sky-500 text-white shadow-sky-500/25' : 'bg-gray-900 text-white shadow-gray-900/25'">
        <span class="shrink-0">
          @if (n.type === 'error') {
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          } @else if (n.type === 'info') {
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/></svg>
          } @else {
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
          }
        </span>
        <span>{{ n.message }}</span>
      </div>
    }
  `,
})
export class ToastComponent {
  constructor(public notificationService: NotificationService) {}
}
