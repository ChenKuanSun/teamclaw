import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  AdminApiService,
  DashboardStats,
} from '../../services/admin-api.service';

@Component({
  selector: 'tc-admin-dashboard',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="dashboard-container">
      <h1>Dashboard</h1>

      @if (isLoading()) {
        <div class="loading">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      } @else if (stats()) {
        <div class="stats-grid">
          <!-- Total Users -->
          <mat-card class="stat-card">
            <mat-card-header>
              <mat-icon mat-card-avatar>people</mat-icon>
              <mat-card-title>Total Users</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="stat-value">{{ stats()!.totalUsers }}</div>
              <div class="stat-sub">{{ stats()!.activeUsers }} active</div>
            </mat-card-content>
          </mat-card>

          <!-- Active Containers -->
          <mat-card class="stat-card">
            <mat-card-header>
              <mat-icon mat-card-avatar>dns</mat-icon>
              <mat-card-title>Active Containers</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="stat-value">{{ stats()!.activeContainers }}</div>
              <div class="stat-sub">running</div>
            </mat-card-content>
          </mat-card>

          <!-- Teams Count -->
          <mat-card class="stat-card">
            <mat-card-header>
              <mat-icon mat-card-avatar>groups</mat-icon>
              <mat-card-title>Teams</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="stat-value">{{ stats()!.totalTeams }}</div>
              <div class="stat-sub">configured</div>
            </mat-card-content>
          </mat-card>

          <!-- API Key Pool Size -->
          <mat-card class="stat-card">
            <mat-card-header>
              <mat-icon mat-card-avatar>vpn_key</mat-icon>
              <mat-card-title>API Key Pool</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="stat-value">{{ stats()!.apiKeyCount }}</div>
              <div class="stat-sub">keys available</div>
            </mat-card-content>
          </mat-card>
        </div>
      } @else if (error()) {
        <mat-card class="error-card">
          <mat-card-content>
            <mat-icon>error</mat-icon>
            <p>{{ error() }}</p>
            <button mat-button color="primary" (click)="loadStats()">Retry</button>
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: `
    .dashboard-container {
      padding: 24px;
    }

    h1 {
      margin-bottom: 24px;
      font-size: 28px;
      font-weight: 500;
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 48px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 24px;
    }

    .stat-card {
      mat-card-header {
        margin-bottom: 16px;

        mat-icon {
          font-size: 32px;
          width: 32px;
          height: 32px;
          color: var(--mat-sys-primary);
        }
      }

      .stat-value {
        font-size: 48px;
        font-weight: 600;
        color: var(--mat-sys-primary);
        margin-bottom: 4px;
      }

      .stat-sub {
        font-size: 14px;
        color: var(--mat-sys-on-surface-variant);
      }
    }

    .error-card {
      mat-card-content {
        display: flex;
        align-items: center;
        gap: 16px;
        color: var(--mat-sys-error);

        mat-icon {
          font-size: 32px;
          width: 32px;
          height: 32px;
        }

        p {
          flex: 1;
          margin: 0;
        }
      }
    }
  `,
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal(true);
  readonly stats = signal<DashboardStats | null>(null);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadStats();
  }

  loadStats(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.api
      .getDashboardStats()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.stats.set(data);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Failed to load dashboard stats:', err);
          this.error.set('Failed to load dashboard statistics');
          this.isLoading.set(false);
        },
      });
  }
}
