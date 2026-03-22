import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import {
  AdminApiService,
  KeyUsageStats,
  ProviderKeyEntry,
} from '../../services/admin-api.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import { AddApiKeyDialogComponent } from './add-api-key-dialog.component';

interface ProviderRow {
  provider: string;
  authType: 'apiKey' | 'oauthToken';
  display: string;
  keyId?: string;
}

@Component({
  selector: 'tc-api-keys',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './api-keys.component.html',
  styleUrl: './api-keys.component.scss',
})
export class ApiKeysComponent implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly rows = signal<ProviderRow[]>([]);
  readonly usageStats = signal<KeyUsageStats | null>(null);
  readonly loading = signal(false);
  readonly displayedColumns = ['provider', 'authType', 'credential', 'actions'];
  readonly usageColumns = ['provider', 'requests', 'cost'];

  ngOnInit(): void {
    this.loadKeys();
    this.loadUsageStats();
  }

  loadKeys(): void {
    this.loading.set(true);
    this.adminApi
      .getApiKeys()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          const rows: ProviderRow[] = [];
          for (const [provider, entry] of Object.entries(res.providers)) {
            if (entry.authType === 'oauthToken') {
              rows.push({
                provider,
                authType: 'oauthToken',
                display: this.formatOAuthDisplay(entry),
              });
            } else if (entry.keys) {
              for (const key of entry.keys) {
                rows.push({
                  provider,
                  authType: 'apiKey',
                  display: key.masked,
                  keyId: key.keyId,
                });
              }
            }
          }
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  loadUsageStats(): void {
    this.adminApi
      .getKeyUsageStats()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: stats => this.usageStats.set(stats),
        error: () => {
          // Usage stats are non-critical; silently ignore errors
        },
      });
  }

  openAddDialog(): void {
    const dialogRef = this.dialog.open(AddApiKeyDialogComponent, {
      width: '480px',
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        if (result) {
          this.adminApi
            .addApiKey(result)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: () => {
                this.snackBar.open('Credential added successfully', 'Dismiss', {
                  duration: 3000,
                });
                this.loadKeys();
              },
              error: err => {
                const msg = err.error?.message || 'Failed to add credential';
                this.snackBar.open(msg, 'Dismiss', {
                  duration: 5000,
                  panelClass: 'snackbar-error',
                });
              },
            });
        }
      });
  }

  removeKey(row: ProviderRow): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Remove Credential',
        message:
          row.authType === 'oauthToken'
            ? `Remove OAuth token for ${row.provider}?`
            : `Remove API key ${row.display} for ${row.provider}?`,
        confirmText: 'Remove',
        confirmColor: 'warn',
        icon: 'vpn_key_off',
      },
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.adminApi
        .removeApiKey(row.provider, row.keyId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.snackBar.open('Credential removed successfully', 'Dismiss', {
              duration: 3000,
            });
            this.loadKeys();
          },
          error: err => {
            const msg = err.error?.message || 'Failed to remove credential';
            this.snackBar.open(msg, 'Dismiss', {
              duration: 5000,
              panelClass: 'snackbar-error',
            });
          },
        });
    });
  }

  private formatOAuthDisplay(entry: ProviderKeyEntry): string {
    const parts: string[] = [];

    // Token type
    if (entry.hasToken) {
      parts.push('Setup token configured');
    } else if (entry.hasAccessToken) {
      parts.push('Access token configured');
    } else {
      parts.push('Token configured');
    }

    // Expiry info
    if (entry.expiresAt) {
      const expiryDate = new Date(entry.expiresAt * 1000);
      const now = new Date();
      const hoursUntilExpiry =
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilExpiry <= 0) {
        parts.push('[EXPIRED]');
      } else if (hoursUntilExpiry <= 24) {
        parts.push(`[Expires in ${Math.ceil(hoursUntilExpiry)}h]`);
      } else {
        const daysUntilExpiry = Math.ceil(hoursUntilExpiry / 24);
        if (daysUntilExpiry <= 7) {
          parts.push(`[Expires in ${daysUntilExpiry}d]`);
        }
      }
    }

    return parts.join(' ');
  }
}
