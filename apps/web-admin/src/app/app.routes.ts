import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { LayoutComponent } from './layout/layout.component';

export const appRoutes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.routes').then(m => m.authRoutes),
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            m => m.DashboardComponent,
          ),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/users/users.component').then(
            m => m.UsersComponent,
          ),
      },
      {
        path: 'users/:userId',
        loadComponent: () =>
          import('./features/user-detail/user-detail.component').then(
            m => m.UserDetailComponent,
          ),
      },
      {
        path: 'teams',
        loadComponent: () =>
          import('./features/teams/teams.component').then(
            m => m.TeamsComponent,
          ),
      },
      {
        path: 'teams/:teamId',
        loadComponent: () =>
          import('./features/team-detail/team-detail.component').then(
            m => m.TeamDetailComponent,
          ),
      },
      {
        path: 'containers',
        loadComponent: () =>
          import('./features/containers/containers.component').then(
            m => m.ContainersComponent,
          ),
      },
      {
        path: 'config',
        loadComponent: () =>
          import('./features/config/config.component').then(
            m => m.ConfigComponent,
          ),
      },
      {
        path: 'api-keys',
        loadComponent: () =>
          import('./features/api-keys/api-keys.component').then(
            m => m.ApiKeysComponent,
          ),
      },
      {
        path: 'integrations',
        loadComponent: () =>
          import('./features/integrations/integrations.component').then(
            m => m.IntegrationsComponent,
          ),
      },
      {
        path: 'integrations/:integrationId',
        loadComponent: () =>
          import('./features/integrations/integration-detail.component').then(
            m => m.IntegrationDetailComponent,
          ),
      },
      {
        path: 'skills',
        loadComponent: () =>
          import('./features/skills/skills.component').then(
            m => m.SkillsComponent,
          ),
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./features/analytics/analytics.component').then(
            m => m.AnalyticsComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
