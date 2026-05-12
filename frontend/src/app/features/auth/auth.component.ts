import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LucideAngularModule, Camera, AlertCircle } from 'lucide-angular';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, RouterModule],
  templateUrl: './auth.component.html',
})
export class AuthComponent {
  readonly Camera = Camera;
  readonly AlertCircle = AlertCircle;

  authMode = signal<'login' | 'register'>('login');
  authError = signal('');
  loading = signal(false);
  form = { email: '', pass: '', passConfirm: '', firstName: '', lastName: '' };

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  toggleAuthMode(): void {
    this.authMode.update(m => m === 'login' ? 'register' : 'login');
    this.authError.set('');
    this.form.passConfirm = '';
    this.form.firstName = '';
    this.form.lastName = '';
  }

  async auth(): Promise<void> {
    this.loading.set(true);
    this.authError.set('');
    try {
      if (this.authMode() === 'register' && this.form.pass !== this.form.passConfirm) {
        this.authError.set('Passwords do not match.');
        this.loading.set(false);
        return;
      }
      if (this.authMode() === 'login') {
        await this.authService.login(this.form.email, this.form.pass);
        this.router.navigate(['/dashboard']);
      } else {
        await this.authService.register(this.form.email, this.form.pass, this.form.passConfirm, this.form.firstName, this.form.lastName);
        await this.authService.login(this.form.email, this.form.pass);
        this.router.navigate(['/dashboard']);
      }
    } catch (error: any) {
      this.authError.set(this.authMode() === 'login' ? 'Invalid email or password.' : 'Registration failed.');
    } finally {
      this.loading.set(false);
    }
  }
}
