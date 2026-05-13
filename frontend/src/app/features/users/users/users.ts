import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PocketBaseService } from '../../../core/services/pocketbase.service';
import { AuthService } from '../../../core/services/auth.service';
import { MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { User } from '../../../core/models';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    CardModule,
    SelectModule,
    TagModule
  ],
  templateUrl: './users.html',
  styleUrls: ['./users.scss']
})
export class Users implements OnInit {
  protected readonly users = signal<User[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  // Dialog state
  protected dialogVisible = false;
  protected dialogMode: 'create' | 'edit' = 'create';
  protected formState: Partial<User> = {};

  protected roleOptions = [
    { label: 'Admin', value: 'admin' },
    { label: 'Operator', value: 'operator' },
    { label: 'User', value: 'regular' }
  ];

  // Access control
  protected readonly isAdmin = computed(() => this.authService.user()?.role === 'admin');
  protected readonly currentUserId = computed(() => this.authService.user()?.id);

  constructor(
    private pb: PocketBaseService,
    private authService: AuthService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  protected async loadUsers() {
    this.loading.set(true);
    try {
      const records = await this.pb.pb.collection('users').getFullList<User>({
        sort: '-id',
      });
      this.users.set(records);
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load users.' });
    } finally {
      this.loading.set(false);
    }
  }

  protected canEdit(user: User): boolean {
    if (this.isAdmin()) return true;
    
    // Operators cannot edit themselves, other operators, or admins.
    // They can only edit "user" role.
    if (user.role === 'admin' || user.role === 'operator') return false;
    
    // Operators cannot edit their own records either (unless implemented differently in requirements)
    if (user.id === this.currentUserId()) return false;

    return true;
  }

  protected openNewUser() {
    this.formState = { first_name: '', last_name: '', email: '', role: 'regular', user_type: 'person', enabled: true, verified: true };
    this.dialogMode = 'create';
    this.dialogVisible = true;
  }

  protected editUser(user: User) {
    this.formState = {
      ...user,
      role: this.normalizeRole(user.role)
    };
    this.dialogMode = 'edit';
    this.dialogVisible = true;
  }

  protected hideDialog() {
    this.dialogVisible = false;
  }

  protected async saveUser() {
    if (!this.formState.email?.trim() || !this.formState.first_name?.trim()) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Email and First Name are required.' });
      return;
    }

    this.saving.set(true);
    try {
      const payload = {
        email: this.formState.email.trim(),
        first_name: this.formState.first_name?.trim() || '',
        last_name: this.formState.last_name?.trim() || '',
        role: this.normalizeRole(this.formState.role),
        user_type: (this.formState['user_type'] as string) || 'person',
        enabled: this.formState['enabled'] ?? true,
        verified: this.formState.verified ?? true,
      };

      if (this.dialogMode === 'create') {
        await this.pb.pb.collection('users').create({
          ...payload,
          password: 'password123', // default temp password
          passwordConfirm: 'password123',
        });
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'User created (temp password123).' });
      } else {
        await this.pb.pb.collection('users').update(this.formState.id!, payload);
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'User updated.' });
      }
      this.dialogVisible = false;
      this.loadUsers();
    } catch (e: any) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to save user.' });
    } finally {
      this.saving.set(false);
    }
  }

  protected async deleteUserConfirm(user: User) {
    if (confirm(`Are you sure you want to delete user "${user.first_name} ${user.last_name}"?`)) {
      try {
        await this.pb.pb.collection('users').delete(user.id);
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'User deleted.' });
        this.loadUsers();
      } catch (e: any) {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to delete user.' });
      }
    }
  }

  protected getRoleSeverity(role: string) {
    switch(role) {
      case 'admin': return 'danger';
      case 'operator': return 'warn';
      default: return 'info';
    }
  }

  protected getDisplayName(user: User): string {
    const first = String(user.first_name ?? '').trim();
    const last = String(user.last_name ?? '').trim();
    const full = `${first} ${last}`.trim();
    const fallbackName = String(user['name'] ?? '').trim();
    return full || fallbackName || user.email;
  }

  private normalizeRole(role?: unknown): 'admin' | 'operator' | 'regular' {
    if (role === 'admin' || role === 'operator' || role === 'regular') {
      return role;
    }

    // Keep compatibility with legacy role naming used in older frontends.
    if (role === 'user') {
      return 'regular';
    }

    return 'regular';
  }
}
