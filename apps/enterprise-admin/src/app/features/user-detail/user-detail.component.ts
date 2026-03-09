import { Location } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import {
  AdminApiService,
  AdminUser,
  Container,
} from '../../services/admin-api.service';

@Component({
  selector: 'tc-admin-user-detail',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  template: `
    <div class="user-detail-container">
      <button mat-button (click)="goBack()">
        <mat-icon>arrow_back</mat-icon>
        Back to Users
      </button>

      @if (isLoading()) {
        <div class="loading">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      } @else if (error()) {
        <mat-card class="error-card">
          <mat-card-content>
            <mat-icon>error</mat-icon>
            <p>{{ error() }}</p>
            <button mat-button color="primary" (click)="reload()">Retry</button>
          </mat-card-content>
        </mat-card>
      } @else if (user()) {
        <!-- User Info Card -->
        <mat-card class="info-card">
          <mat-card-header>
            <mat-icon mat-card-avatar>person</mat-icon>
            <mat-card-title>{{ user()!.email }}</mat-card-title>
            <mat-card-subtitle>User Information</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">User ID</span>
                <span class="info-value">{{ user()!.userId }}</span>
              </div>
              @if (user()!.displayName) {
                <div class="info-item">
                  <span class="info-label">Display Name</span>
                  <span class="info-value">{{ user()!.displayName }}</span>
                </div>
              }
              <div class="info-item">
                <span class="info-label">Team</span>
                <span class="info-value">{{ user()!.teamId || 'None' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Status</span>
                <span class="info-value">{{ user()!.status }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Created</span>
                <span class="info-value">{{ user()!.createdAt }}</span>
              </div>
              @if (user()!.lastActiveAt) {
                <div class="info-item">
                  <span class="info-label">Last Active</span>
                  <span class="info-value">{{ user()!.lastActiveAt }}</span>
                </div>
              }
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Container Status Card -->
        <mat-card class="container-card">
          <mat-card-header>
            <mat-icon mat-card-avatar>dns</mat-icon>
            <mat-card-title>Container</mat-card-title>
            @if (container()) {
              <mat-card-subtitle>
                <span class="status-badge" [class]="'status-' + container()!.status">
                  {{ container()!.status }}
                </span>
              </mat-card-subtitle>
            } @else {
              <mat-card-subtitle>No container</mat-card-subtitle>
            }
          </mat-card-header>
          <mat-card-content>
            @if (container()) {
              <div class="info-grid">
                @if (container()!.taskArn) {
                  <div class="info-item">
                    <span class="info-label">Task ARN</span>
                    <span class="info-value mono">{{ container()!.taskArn }}</span>
                  </div>
                }
                @if (container()!.startedAt) {
                  <div class="info-item">
                    <span class="info-label">Started At</span>
                    <span class="info-value">{{ container()!.startedAt }}</span>
                  </div>
                }
                @if (container()!.stoppedAt) {
                  <div class="info-item">
                    <span class="info-label">Stopped At</span>
                    <span class="info-value">{{ container()!.stoppedAt }}</span>
                  </div>
                }
              </div>
            }
          </mat-card-content>
          <mat-card-actions>
            <button mat-raised-button
                    color="primary"
                    [disabled]="isActionInProgress()"
                    (click)="startContainer()"
                    matTooltip="Start the user's container">
              <mat-icon>play_arrow</mat-icon>
              Start
            </button>
            <button mat-raised-button
                    color="warn"
                    [disabled]="isActionInProgress()"
                    (click)="stopContainer()"
                    matTooltip="Stop the user's container">
              <mat-icon>stop</mat-icon>
              Stop
            </button>
            <button mat-stroked-button
                    [disabled]="isActionInProgress()"
                    (click)="provisionContainer()"
                    matTooltip="Provision a new container for the user">
              <mat-icon>add_box</mat-icon>
              Provision
            </button>
          </mat-card-actions>
        </mat-card>
      }
    </div>
  `,
  styles: `
    .user-detail-container {
      padding: 24px;
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 48px;
    }

    .info-card,
    .container-card {
      margin-top: 24px;

      mat-card-header {
        margin-bottom: 16px;

        mat-icon {
          font-size: 32px;
          width: 32px;
          height: 32px;
          color: var(--mat-sys-primary);
        }
      }
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }

    .info-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .info-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--mat-sys-on-surface-variant);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .info-value {
      font-size: 14px;
      color: var(--mat-sys-on-surface);

      &.mono {
        font-family: monospace;
        font-size: 12px;
        word-break: break-all;
      }
    }

    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
      text-transform: capitalize;

      &.status-running {
        background-color: #e8f5e9;
        color: #2e7d32;
      }

      &.status-stopped {
        background-color: #ffebee;
        color: #c62828;
      }

      &.status-provisioned {
        background-color: #fff8e1;
        color: #f57f17;
      }
    }

    mat-card-actions {
      display: flex;
      gap: 8px;
      padding: 16px;
    }

    .error-card {
      margin-top: 24px;

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
export class UserDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly api = inject(AdminApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal(true);
  readonly isActionInProgress = signal(false);
  readonly error = signal<string | null>(null);
  readonly user = signal<AdminUser | null>(null);
  readonly container = signal<Container | null>(null);

  private userId = '';

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get('userId') ?? '';
    if (this.userId) {
      this.loadUserData();
    } else {
      this.error.set('User ID is required');
      this.isLoading.set(false);
    }
  }

  reload(): void {
    if (this.userId) {
      this.loadUserData();
    }
  }

  goBack(): void {
    this.location.back();
  }

  private loadUserData(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.api
      .getUser(this.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (userData) => {
          this.user.set(userData);
          this.loadContainer();
        },
        error: (err) => {
          console.error('Failed to load user:', err);
          this.error.set('Failed to load user details');
          this.isLoading.set(false);
        },
      });
  }

  private loadContainer(): void {
    this.api
      .getContainer(this.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (containerData) => {
          this.container.set(containerData);
          this.isLoading.set(false);
        },
        error: () => {
          // Container may not exist yet — not an error
          this.container.set(null);
          this.isLoading.set(false);
        },
      });
  }

  startContainer(): void {
    this.isActionInProgress.set(true);

    this.api
      .startContainer(this.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.container.set(updated);
          this.isActionInProgress.set(false);
          this.snackBar.open('Container started', 'Close', { duration: 3000 });
        },
        error: (err) => {
          console.error('Failed to start container:', err);
          this.isActionInProgress.set(false);
          this.snackBar.open('Failed to start container', 'Close', { duration: 3000 });
        },
      });
  }

  stopContainer(): void {
    this.isActionInProgress.set(true);

    this.api
      .stopContainer(this.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.container.set(updated);
          this.isActionInProgress.set(false);
          this.snackBar.open('Container stopped', 'Close', { duration: 3000 });
        },
        error: (err) => {
          console.error('Failed to stop container:', err);
          this.isActionInProgress.set(false);
          this.snackBar.open('Failed to stop container', 'Close', { duration: 3000 });
        },
      });
  }

  provisionContainer(): void {
    this.isActionInProgress.set(true);

    this.api
      .provisionContainer(this.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.container.set(updated);
          this.isActionInProgress.set(false);
          this.snackBar.open('Container provisioned', 'Close', { duration: 3000 });
        },
        error: (err) => {
          console.error('Failed to provision container:', err);
          this.isActionInProgress.set(false);
          this.snackBar.open('Failed to provision container', 'Close', { duration: 3000 });
        },
      });
  }
}
