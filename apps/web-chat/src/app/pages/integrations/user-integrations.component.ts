import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslateModule } from '@ngx-translate/core';
import {
  IntegrationsService,
  UserIntegration,
} from '../../services/integrations.service';
import { UserCredDialogComponent } from './user-cred-dialog.component';

@Component({
  selector: 'tc-user-integrations',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    TranslateModule,
  ],
  templateUrl: './user-integrations.component.html',
  styleUrl: './user-integrations.component.scss',
})
export class UserIntegrationsComponent implements OnInit {
  private readonly integrationsService = inject(IntegrationsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly integrations = signal<UserIntegration[]>([]);
  readonly loading = signal(false);
  readonly actionLoading = signal(false);

  ngOnInit(): void {
    this.loadIntegrations();
  }

  loadIntegrations(): void {
    this.loading.set(true);
    this.integrationsService
      .listMyIntegrations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.integrations.set(res.integrations);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  getStatusText(item: UserIntegration): string {
    switch (item.credentialSource) {
      case 'global':
        return 'Using: Company token';
      case 'team':
        return `Using: Team token${item.teamName ? ` (${item.teamName})` : ''}`;
      case 'personal':
        return 'Connected as personal';
      default:
        return 'Not connected';
    }
  }

  connect(item: UserIntegration): void {
    const dialogRef = this.dialog.open(UserCredDialogComponent, {
      width: '420px',
      data: {
        integrationName: item.displayName,
        schema: item.credentialSchema || [],
      },
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        if (!result) return;
        this.actionLoading.set(true);
        this.integrationsService
          .connectIntegration(item.integrationId, result)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.actionLoading.set(false);
              this.snackBar.open('Connected successfully', 'Dismiss', {
                duration: 3000,
              });
              this.loadIntegrations();
            },
            error: err => {
              this.actionLoading.set(false);
              this.snackBar.open(
                err.error?.message || 'Failed to connect',
                'Dismiss',
                { duration: 5000, panelClass: 'snackbar-error' },
              );
            },
          });
      });
  }

  disconnect(item: UserIntegration): void {
    if (
      !confirm(
        `Disconnect ${item.displayName}? Your personal credentials will be removed.`,
      )
    ) {
      return;
    }

    this.actionLoading.set(true);
    this.integrationsService
      .disconnectIntegration(item.integrationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionLoading.set(false);
          this.snackBar.open('Disconnected', 'Dismiss', { duration: 3000 });
          this.loadIntegrations();
        },
        error: err => {
          this.actionLoading.set(false);
          this.snackBar.open(
            err.error?.message || 'Failed to disconnect',
            'Dismiss',
            { duration: 5000, panelClass: 'snackbar-error' },
          );
        },
      });
  }
}
