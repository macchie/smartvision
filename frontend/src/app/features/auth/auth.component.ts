import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { UserConfigService } from '../../core/services/user-config.service';
import { LucideAngularModule, ScanLine, AlertCircle, Sun, Moon } from 'lucide-angular';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, RouterModule],
  templateUrl: './auth.component.html',
})
export class AuthComponent {
  readonly ScanLine = ScanLine;
  readonly AlertCircle = AlertCircle;
  readonly Sun = Sun;
  readonly Moon = Moon;

  authError = signal('');
  loading = signal(false);
  form = { email: '', pass: '' };

  readonly lightModeLabel = $localize`:@@theme.switchToLight:Switch to light mode`;
  readonly darkModeLabel = $localize`:@@theme.switchToDark:Switch to dark mode`;
  readonly signInLabel = $localize`:@@auth.signIn:Sign In`;
  readonly waitLabel = $localize`:@@common.pleaseWait:Please wait…`;

  constructor(
    private authService: AuthService,
    public themeService: ThemeService,
    private userConfig: UserConfigService,
    private router: Router,
  ) {}

  toggleTheme(): void {
    this.themeService.toggle();
  }

  async auth(): Promise<void> {
    this.loading.set(true);
    this.authError.set('');
    try {
      await this.authService.login(this.form.email, this.form.pass);
      // Apply the user's stored language/theme. If the stored language differs
      // from the current one, load() reloads the page to apply translations;
      // otherwise we continue to the dashboard.
      await this.userConfig.load();
      this.router.navigate(['/dashboard']);
    } catch {
      this.authError.set($localize`:@@auth.error:Invalid credentials or unauthorized role. Only admin and operator accounts can sign in.`);
    } finally {
      this.loading.set(false);
    }
  }
}
