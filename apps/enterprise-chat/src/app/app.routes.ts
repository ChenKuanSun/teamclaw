import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const appRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () =>
      import('./layout/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'session',
        loadComponent: () =>
          import('./pages/session-init/session-init.component').then(m => m.SessionInitComponent),
      },
      {
        path: 'chat',
        loadComponent: () =>
          import('./pages/chat/chat.component').then(m => m.ChatComponent),
      },
      {
        path: '',
        redirectTo: 'session',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
