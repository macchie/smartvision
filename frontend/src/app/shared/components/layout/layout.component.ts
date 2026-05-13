import { Component, computed, ViewChild } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { ButtonModule } from 'primeng/button';
import { Menu, MenuModule } from 'primeng/menu';
import { AvatarModule } from 'primeng/avatar';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ButtonModule, MenuModule, AvatarModule],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent {
  @ViewChild('userMenu') private userMenu?: Menu;

  protected readonly userMenuItems = computed<MenuItem[]>(() => [
    {
      label: 'Sign Out',
      icon: 'pi pi-sign-out',
      command: () => this.signOut(),
    },
  ]);

  constructor(
    public authService: AuthService,
    private router: Router
  ) {}

  protected toggleUserMenu(event: Event): void {
    this.userMenu?.toggle(event);
  }

  protected signOut(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
