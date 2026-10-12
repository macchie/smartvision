import { Component, computed, signal, ViewChild } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { BadgeService, BadgeUserType } from '../../../core/services/badge.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ButtonModule } from 'primeng/button';
import { Menu, MenuModule } from 'primeng/menu';
import { AvatarModule } from 'primeng/avatar';
import { MenuItem } from 'primeng/api';
import { LucideAngularModule, Sparkles } from 'lucide-angular';
import { SettingsDialogComponent } from '../settings-dialog/settings-dialog.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ButtonModule, MenuModule, AvatarModule, LucideAngularModule, SettingsDialogComponent],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent {
  @ViewChild('userMenu') private userMenu?: Menu;

  protected readonly Sparkles = Sparkles;

  protected readonly settingsVisible = signal(false);

  protected readonly lightModeLabel = $localize`:@@theme.switchToLight:Switch to light mode`;
  protected readonly darkModeLabel = $localize`:@@theme.switchToDark:Switch to dark mode`;
  protected readonly userMenuLabel = $localize`:@@menu.openUserMenu:Open user menu`;

  protected readonly userMenuItems = computed<MenuItem[]>(() => [
    {
      label: $localize`:@@menu.settings:Settings`,
      icon: 'pi pi-cog',
      command: () => this.openSettings(),
    },
    {
      label: $localize`:@@menu.downloadBadge:Download Badge`,
      icon: 'pi pi-id-card',
      command: () => this.downloadBadge(),
    },
    {
      separator: true,
    },
    {
      label: $localize`:@@menu.signOut:Sign Out`,
      icon: 'pi pi-sign-out',
      command: () => this.signOut(),
    },
  ]);

  constructor(
    public authService: AuthService,
    public themeService: ThemeService,
    private router: Router,
    private badgeService: BadgeService,
    private notification: NotificationService
  ) {}

  protected toggleUserMenu(event: Event): void {
    this.userMenu?.toggle(event);
  }

  protected openSettings(): void {
    this.settingsVisible.set(true);
  }

  protected downloadBadge(): void {
    const user = this.authService.user();
    if (!user) return;
    try {
      // Console accounts are admins/operators, so the badge is always a plain
      // person badge with no type pill.
      const type: BadgeUserType = 'person';
      this.badgeService.downloadUserBadge({
        id: user.id,
        displayName: this.authService.userDisplayName,
        type,
        typeLabel: '',
      });
    } catch {
      this.notification.notify(
        $localize`:@@menu.downloadBadgeFailed:Could not generate the badge`,
        'error',
      );
    }
  }

  protected toggleTheme(): void {
    this.themeService.toggle();
  }

  protected signOut(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
