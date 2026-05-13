import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { LayoutComponent } from './shared/components/layout/layout.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'cameras',
        loadComponent: () => import('./features/cameras/cameras/cameras').then(m => m.Cameras),
      },
      {
        path: 'users',
        loadComponent: () => import('./features/users/users/users').then(m => m.Users),
      },
      {
        path: 'vehicles',
        loadComponent: () => import('./features/vehicles/vehicles/vehicles').then(m => m.Vehicles),
      },
      {
        path: 'rooms',
        loadComponent: () => import('./features/rooms/rooms/rooms').then(m => m.Rooms),
      },
      {
        path: 'room-groups',
        loadComponent: () => import('./features/room-groups/room-groups/room-groups').then(m => m.RoomGroups),
      }
    ]
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/auth.component').then(m => m.AuthComponent),
  },
  { path: '**', redirectTo: 'dashboard' },
];
