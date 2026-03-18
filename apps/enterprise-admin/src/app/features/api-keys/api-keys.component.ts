import { Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  AdminApiService,
  ProviderKeyEntry,
  KeyUsageStats,
} from '../../services/admin-api.service';
import { AddApiKeyDialogComponent } from './add-api-key-dialog.component';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';

interface ProviderRow {
  provider: string;
  authType: 'apiKey' | 'oauthToken';
  display: string;
  keyIndex?: number;
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
  ],
  template: `
    <div class="api-keys-container">
      <div class="header">
        <h2>API Keys</h2>
        <button mat-raised-button color="primary" (click)="openAddDialog()">
          <mat-icon>add</mat-icon> Add Key
        </button>
      </div>

      @if (loading()) {
        <div class="spinner-wrapper">
          <mat-progress-spinner mode="indeterminate" diameter="48" />
        </div>
      } @else if (rows().length === 0) {
        <mat-card>
          <mat-card-content>
            <p class="empty-state">No API keys configured. Add one to get started.</p>
          </mat-card-content>
        </mat-card>
      } @else {
        <mat-card>
          <table mat-table [dataSource]="rows()" class="full-width">
            <ng-container matColumnDef="provider">
              <th mat-header-cell *matHeaderCellDef>Provider</th>
              <td mat-cell *matCellDef="let row">{{ row.provider }}</td>
            </ng-container>

            <ng-container matColumnDef="authType">
              <th mat-header-cell *matHeaderCellDef>Type</th>
              <td mat-cell *matCellDef="let row">
                <mat-chip [highlighted]="row.authType === 'oauthToken'">
                  {{ row.authType === 'oauthToken' ? 'OAuth Token' : 'API Key' }}
                </mat-chip>
              </td>
            </ng-container>

            <ng-container matColumnDef="credential">
              <th mat-header-cell *matHeaderCellDef>Credential</th>
              <td mat-cell *matCellDef="let row" class="monospace">{{ row.display }}</td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef>Actions</th>
              <td mat-cell *matCellDef="let row">
                <button mat-icon-button color="warn" (click)="removeKey(row)">
                  <mat-icon>delete</mat-icon>
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
          </table>
        </mat-card>
      }

      <!-- Usage Stats -->
      @if (usageStats()) {
        <h3>Usage Statistics</h3>
        <div class="stats-grid">
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">{{ usageStats()!.totalRequests | number }}</div>
              <div class="stat-label">Total Requests</div>
            </mat-card-content>
          </mat-card>
        </div>

        @if (usageStats()!.byProvider.length) {
          <mat-card class="usage-table-card">
            <table mat-table [dataSource]="usageStats()!.byProvider" class="full-width">
              <ng-container matColumnDef="provider">
                <th mat-header-cell *matHeaderCellDef>Provider</th>
                <td mat-cell *matCellDef="let row">{{ row.provider }}</td>
              </ng-container>
              <ng-container matColumnDef="requests">
                <th mat-header-cell *matHeaderCellDef>Requests</th>
                <td mat-cell *matCellDef="let row">{{ row.requests | number }}</td>
              </ng-container>
              <ng-container matColumnDef="cost">
                <th mat-header-cell *matHeaderCellDef>Cost</th>
                <td mat-cell *matCellDef="let row">{{ row.cost ? ('$' + (row.cost | number: '1.2-2')) : 'N/A' }}</td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="usageColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: usageColumns"></tr>
            </table>
          </mat-card>
        }
      }
    </div>
  `,
  styles: [`
    .api-keys-container { padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .full-width { width: 100%; }
    .monospace { font-family: monospace; }
    .spinner-wrapper { display: flex; justify-content: center; padding: 48px; }
    .empty-state { text-align: center; color: var(--mat-sys-on-surface-variant); padding: 24px; }
    h3 { margin-top: 24px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px; }
    .stat-card { text-align: center; }
    .stat-value { font-size: 2rem; font-weight: 600; color: #1976d2; }
    .stat-label { color: #666; margin-top: 4px; }
    .usage-table-card { margin-top: 16px; }
  `],
})
export class ApiKeysComponent implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly dialog = inject(MatDialog);
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
    this.adminApi.getApiKeys().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        const rows: ProviderRow[] = [];
        for (const [provider, entry] of Object.entries(res.providers)) {
          if (entry.authType === 'oauthToken') {
            rows.push({
              provider,
              authType: 'oauthToken',
              display: entry.hasToken ? 'Token configured' : 'Access token configured',
            });
          } else if (entry.keys) {
            for (const key of entry.keys) {
              rows.push({
                provider,
                authType: 'apiKey',
                display: key.masked,
                keyIndex: key.index,
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
    this.adminApi.getKeyUsageStats().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (stats) => this.usageStats.set(stats),
    });
  }

  openAddDialog(): void {
    const dialogRef = this.dialog.open(AddApiKeyDialogComponent, {
      width: '480px',
    });

    dialogRef.afterClosed().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((result) => {
      if (result) {
        this.adminApi.addApiKey(result).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: () => this.loadKeys(),
        });
      }
    });
  }

  removeKey(row: ProviderRow): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Remove Credential',
        message: row.authType === 'oauthToken'
          ? `Remove OAuth token for ${row.provider}?`
          : `Remove API key ${row.display} for ${row.provider}?`,
        confirmText: 'Remove',
        confirmColor: 'warn',
        icon: 'vpn_key_off',
      },
    });
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.adminApi.removeApiKey(row.provider, row.keyIndex)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: () => this.loadKeys() });
    });
  }
}
