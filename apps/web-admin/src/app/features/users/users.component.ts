import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import {
  AdminApiService,
  AdminUser,
  QueryUsersResponse,
} from '../../services/admin-api.service';

type ContainerStatus = 'running' | 'stopped' | 'provisioned' | string;

@Component({
  selector: 'tc-admin-users',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
  ],
  template: `
    <div class="users-container">
      <h1>Users</h1>

      <!-- Search -->
      <mat-card class="search-card">
        <mat-card-content>
          <mat-form-field appearance="outline" class="search-field">
            <mat-label>Search by email</mat-label>
            <input matInput
                   [value]="emailFilter()"
                   (input)="onEmailSearch($event)"
                   placeholder="user&#64;example.com" />
            <mat-icon matSuffix>search</mat-icon>
          </mat-form-field>
        </mat-card-content>
      </mat-card>

      @if (isLoading()) {
        <div class="loading">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      } @else if (error()) {
        <mat-card class="error-card">
          <mat-card-content>
            <mat-icon>error</mat-icon>
            <p>{{ error() }}</p>
            <button mat-button color="primary" (click)="loadUsers()">Retry</button>
          </mat-card-content>
        </mat-card>
      } @else {
        <mat-card>
          <table mat-table [dataSource]="users()" class="users-table">
            <!-- Email Column -->
            <ng-container matColumnDef="email">
              <th mat-header-cell *matHeaderCellDef>Email</th>
              <td mat-cell *matCellDef="let user">{{ user.email }}</td>
            </ng-container>

            <!-- Team Column -->
            <ng-container matColumnDef="teamId">
              <th mat-header-cell *matHeaderCellDef>Team</th>
              <td mat-cell *matCellDef="let user">{{ user.teamId || '—' }}</td>
            </ng-container>

            <!-- Container Status Column -->
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Container Status</th>
              <td mat-cell *matCellDef="let user">
                <span class="status-badge" [class]="'status-' + user.status">
                  {{ user.status }}
                </span>
              </td>
            </ng-container>

            <!-- Last Active Column -->
            <ng-container matColumnDef="lastActiveAt">
              <th mat-header-cell *matHeaderCellDef>Last Active</th>
              <td mat-cell *matCellDef="let user">{{ user.lastActiveAt || '—' }}</td>
            </ng-container>

            <!-- Actions Column -->
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef>Actions</th>
              <td mat-cell *matCellDef="let user">
                <a mat-icon-button
                   [routerLink]="['/users', user.userId]"
                   matTooltip="View details">
                  <mat-icon>visibility</mat-icon>
                </a>
                <button mat-icon-button
                        matTooltip="Start container"
                        [disabled]="actionInProgress()"
                        (click)="startContainer(user.userId)">
                  <mat-icon>play_arrow</mat-icon>
                </button>
                <button mat-icon-button
                        matTooltip="Stop container"
                        [disabled]="actionInProgress()"
                        (click)="stopContainer(user.userId)">
                  <mat-icon>stop</mat-icon>
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          </table>

          <mat-paginator
            [length]="totalUsers()"
            [pageSize]="pageSize()"
            [pageSizeOptions]="[10, 25, 50]"
            (page)="onPageChange($event)"
            showFirstLastButtons>
          </mat-paginator>
        </mat-card>
      }
    </div>
  `,
  styles: `
    .users-container {
      padding: 24px;
    }

    h1 {
      margin-bottom: 24px;
      font-size: 28px;
      font-weight: 500;
    }

    .search-card {
      margin-bottom: 24px;
    }

    .search-field {
      width: 100%;
      max-width: 400px;
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 48px;
    }

    .users-table {
      width: 100%;
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
export class UsersComponent implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly displayedColumns = ['email', 'teamId', 'status', 'lastActiveAt', 'actions'];

  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);
  readonly users = signal<AdminUser[]>([]);
  readonly totalUsers = signal(0);
  readonly emailFilter = signal('');
  readonly pageSize = signal(25);
  readonly pageIndex = signal(0);
  readonly actionInProgress = signal(false);

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.api
      .queryUsers({
        limit: this.pageSize(),
        offset: this.pageIndex() * this.pageSize(),
        email: this.emailFilter() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response: QueryUsersResponse) => {
          this.users.set(response.users);
          this.totalUsers.set(response.total);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Failed to load users:', err);
          this.error.set('Failed to load users');
          this.isLoading.set(false);
        },
      });
  }

  onEmailSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.emailFilter.set(input.value);
    this.pageIndex.set(0);
    this.loadUsers();
  }

  onPageChange(event: PageEvent): void {
    this.pageSize.set(event.pageSize);
    this.pageIndex.set(event.pageIndex);
    this.loadUsers();
  }

  startContainer(userId: string): void {
    this.actionInProgress.set(true);

    this.api
      .startContainer(userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionInProgress.set(false);
          this.snackBar.open('Container started', 'Close', { duration: 3000 });
          this.loadUsers();
        },
        error: (err) => {
          console.error('Failed to start container:', err);
          this.actionInProgress.set(false);
          this.snackBar.open('Failed to start container', 'Close', { duration: 3000 });
        },
      });
  }

  stopContainer(userId: string): void {
    this.actionInProgress.set(true);

    this.api
      .stopContainer(userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionInProgress.set(false);
          this.snackBar.open('Container stopped', 'Close', { duration: 3000 });
          this.loadUsers();
        },
        error: (err) => {
          console.error('Failed to stop container:', err);
          this.actionInProgress.set(false);
          this.snackBar.open('Failed to stop container', 'Close', { duration: 3000 });
        },
      });
  }
}
