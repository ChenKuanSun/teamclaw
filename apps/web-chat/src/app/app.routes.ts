import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const appRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('./pages/signup/signup.component').then(m => m.SignupComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./pages/forgot-password/forgot-password.component').then(
        m => m.ForgotPasswordComponent,
      ),
  },
  {
    path: 'verify',
    loadComponent: () =>
      import('./pages/verify/verify.component').then(m => m.VerifyComponent),
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
          import('./pages/session-init/session-init.component').then(
            m => m.SessionInitComponent,
          ),
      },
      {
        path: 'chat',
        loadComponent: () =>
          import('./pages/chat/chat.component').then(m => m.ChatComponent),
      },
      {
        path: 'integrations',
        loadComponent: () =>
          import('./pages/integrations/user-integrations.component').then(
            m => m.UserIntegrationsComponent,
          ),
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
