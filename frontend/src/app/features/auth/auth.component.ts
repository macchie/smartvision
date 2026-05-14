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

  authError = signal('');
  loading = signal(false);
  form = { email: '', pass: '' };

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  async auth(): Promise<void> {
    this.loading.set(true);
    this.authError.set('');
    try {
      await this.authService.login(this.form.email, this.form.pass);
      this.router.navigate(['/dashboard']);
    } catch {
      this.authError.set('Invalid credentials or unauthorized role. Only admin and operator accounts can sign in.');
    } finally {
      this.loading.set(false);
    }
  }
}
