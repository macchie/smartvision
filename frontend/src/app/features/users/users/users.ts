import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PocketBaseService } from '../../../core/services/pocketbase.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
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
    TextareaModule,
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
  protected readonly searchQuery = signal('');
  protected readonly sortField = signal<'type' | 'username' | 'name' | 'company' | 'email' | 'role' | 'enabled' | 'verified' | 'notes'>('name');
  protected readonly sortDirection = signal<'asc' | 'desc'>('asc');
  protected readonly filteredUsers = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const sortField = this.sortField();
    const sortDirection = this.sortDirection();
    const rows = this.users()
      .filter(user => {
        if (!query) {
          return true;
        }

        const haystack = [
          this.getDisplayName(user),
          user['username'],
          user['name'],
          user.email,
          user.role,
          user['user_type'],
          user['notes'],
          user['enabled'] ? 'yes enabled' : 'no disabled',
          user.verified ? 'verified' : 'not verified',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(query);
      })
      .slice();

    const compareText = (a: string, b: string) => a.localeCompare(b);
    const compareBoolean = (a: boolean, b: boolean) => Number(a) - Number(b);

    rows.sort((a, b) => {
      let result = 0;

      switch (sortField) {
        case 'type':
          result = compareText(this.getUserTypeLabel(a), this.getUserTypeLabel(b));
          break;
        case 'username':
          result = compareText(String(a['username'] || ''), String(b['username'] || ''));
          break;
        case 'company':
          result = compareText(String(a['name'] || ''), String(b['name'] || ''));
          break;
        case 'email':
          result = compareText(a.email || '', b.email || '');
          break;
        case 'role':
          result = compareText(a.role || '', b.role || '');
          break;
        case 'enabled':
          result = compareBoolean(!!a['enabled'], !!b['enabled']);
          break;
        case 'verified':
          result = compareBoolean(!!a.verified, !!b.verified);
          break;
        case 'notes':
          result = compareText(String(a['notes'] || ''), String(b['notes'] || ''));
          break;
        case 'name':
        default:
          result = compareText(this.getDisplayName(a), this.getDisplayName(b));
          break;
      }

      return sortDirection === 'asc' ? result : -result;
    });

    return rows;
  });

  // Dialog state
  protected dialogVisible = false;
  protected dialogMode: 'create' | 'edit' = 'create';
  protected formState: Partial<User> = {};

  protected roleOptions = [
    { label: 'Admin', value: 'admin' },
    { label: 'Operator', value: 'operator' },
    { label: 'User', value: 'regular' }
  ];

  protected userTypeOptions = [
    { label: 'Person', value: 'person' },
    { label: 'Company', value: 'company' },
  ];

  // Access control
  protected readonly isAdmin = computed(() => this.authService.user()?.role === 'admin');
  protected readonly currentUserId = computed(() => this.authService.user()?.id);

  constructor(
    private pb: PocketBaseService,
    private authService: AuthService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
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
      this.users.set(records.map(record => ({
        ...record,
        created: record['created'] || record['created_at'] || '',
        updated: record['updated'] || record['updated_at'] || '',
      })));
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
    this.formState = {
      first_name: '',
      last_name: '',
      name: '',
      username: '',
      notes: '',
      email: '',
      role: 'regular',
      user_type: 'person',
      enabled: true,
    };
    this.dialogMode = 'create';
    this.dialogVisible = true;
  }

  protected editUser(user: User) {
    this.formState = {
      ...user,
      user_type: this.normalizeUserType(user['user_type']),
      role: this.normalizeRole(user.role)
    };
    this.dialogMode = 'edit';
    this.dialogVisible = true;
  }

  protected onUserTypeChange(userType: 'person' | 'company'): void {
    if (userType === 'company') {
      this.formState.first_name = '';
      this.formState.last_name = '';
    } else {
      this.formState['name'] = '';
    }
  }

  protected hideDialog() {
    this.dialogVisible = false;
  }

  protected async saveUser() {
    const userType = this.normalizeUserType(this.formState['user_type']);
    if (!this.formState.email?.trim()) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Email is required.' });
      return;
    }

    if (userType === 'person' && !this.formState.first_name?.trim()) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'First Name is required for person users.' });
      return;
    }

    if (userType === 'company' && !String(this.formState['name'] || '').trim()) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Company Name is required for company users.' });
      return;
    }

    this.saving.set(true);
    try {
      const payload = {
        email: this.formState.email.trim(),
        user_type: userType,
        name: String(this.formState['name'] || '').trim(),
        first_name: this.formState.first_name?.trim() || '',
        last_name: this.formState.last_name?.trim() || '',
        username: String(this.formState['username'] || '').trim(),
        notes: String(this.formState['notes'] || '').trim(),
        role: this.normalizeRole(this.formState.role),
        enabled: this.formState['enabled'] ?? true,
        emailVisibility: false,
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

  protected deleteUserConfirm(user: User) {
    this.confirmationService.confirm({
      header: 'Delete User',
      message: `Are you sure you want to delete user "${this.getDisplayName(user)}"?`,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.pb.pb.collection('users').delete(user.id);
          this.messageService.add({ severity: 'success', summary: 'Success', detail: 'User deleted.' });
          this.loadUsers();
        } catch (e: any) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: e.message || 'Failed to delete user.' });
        }
      },
    });
  }

  protected getRoleSeverity(role: string) {
    switch(role) {
      case 'admin': return 'danger';
      case 'operator': return 'warn';
      default: return 'info';
    }
  }

  protected getUserTypeLabel(user: User): string {
    return this.normalizeUserType(user['user_type']) === 'company' ? 'Company' : 'Person';
  }

  protected getDisplayName(user: User): string {
    const first = String(user.first_name ?? '').trim();
    const last = String(user.last_name ?? '').trim();
    const full = `${first} ${last}`.trim();
    const fallbackName = String(user['name'] ?? '').trim();
    return full || fallbackName || user.email;
  }

  protected toggleSort(field: 'type' | 'username' | 'name' | 'company' | 'email' | 'role' | 'enabled' | 'verified' | 'notes'): void {
    if (this.sortField() === field) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
      return;
    }

    this.sortField.set(field);
    this.sortDirection.set('asc');
  }

  protected getSortIcon(field: 'type' | 'username' | 'name' | 'company' | 'email' | 'role' | 'enabled' | 'verified' | 'notes'): string {
    if (this.sortField() !== field) {
      return 'pi-sort-alt text-slate-400';
    }

    return this.sortDirection() === 'asc'
      ? 'pi-sort-amount-up-alt text-blue-600'
      : 'pi-sort-amount-down text-blue-600';
  }

  protected formatDateTime(value?: string): string {
    if (!value) {
      return '-';
    }

    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : '-';
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

  private normalizeUserType(userType?: unknown): 'person' | 'company' {
    return userType === 'company' ? 'company' : 'person';
  }
}
