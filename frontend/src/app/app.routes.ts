import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./shared/components/layout/layout.component').then((module) => module.LayoutComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then((module) => module.DashboardComponent),
      },
      {
        path: 'cameras',
        loadComponent: () => import('./features/cameras/cameras/cameras').then((module) => module.Cameras),
      },
      {
        path: 'users',
        loadComponent: () => import('./features/users/users/users').then((module) => module.Users),
      },
      {
        path: 'vehicles',
        loadComponent: () => import('./features/vehicles/vehicles/vehicles').then((module) => module.Vehicles),
      },
      {
        path: 'rooms',
        loadComponent: () => import('./features/rooms/rooms/rooms').then((module) => module.Rooms),
      },
      {
        path: 'access-logs',
        loadComponent: () => import('./features/access-logs/access-logs/access-logs').then((module) => module.AccessLogs),
      },
      {
        path: 'room-groups',
        redirectTo: 'rooms',
      }
    ]
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/auth.component').then((module) => module.AuthComponent),
  },
  { path: '**', redirectTo: 'dashboard' },
];
