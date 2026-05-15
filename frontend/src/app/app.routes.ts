import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { LayoutComponent } from './shared/components/layout/layout.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { Cameras } from './features/cameras/cameras/cameras';
import { Users } from './features/users/users/users';
import { Vehicles } from './features/vehicles/vehicles/vehicles';
import { Rooms } from './features/rooms/rooms/rooms';
import { AccessLogs } from './features/access-logs/access-logs/access-logs';
import { AuthComponent } from './features/auth/auth.component';

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
        component: DashboardComponent,
      },
      {
        path: 'cameras',
        component: Cameras,
      },
      {
        path: 'users',
        component: Users,
      },
      {
        path: 'vehicles',
        component: Vehicles,
      },
      {
        path: 'rooms',
        component: Rooms,
      },
      {
        path: 'access-logs',
        component: AccessLogs,
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
    component: AuthComponent,
  },
  { path: '**', redirectTo: 'dashboard' },
];
