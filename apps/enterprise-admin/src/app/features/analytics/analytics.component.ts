import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  AdminApiService,
  SystemAnalyticsResponse,
  UsageByProviderResponse,
} from '../../services/admin-api.service';

@Component({
  selector: 'tc-analytics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    DecimalPipe,
  ],
  template: `
    <div class="analytics-container">
      <h2>Analytics</h2>

      <div class="date-range">
        <mat-form-field appearance="outline">
          <mat-label>Start Date</mat-label>
          <input matInput [matDatepicker]="startPicker" [(ngModel)]="startDate" />
          <mat-datepicker-toggle matIconSuffix [for]="startPicker" />
          <mat-datepicker #startPicker />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>End Date</mat-label>
          <input matInput [matDatepicker]="endPicker" [(ngModel)]="endDate" />
          <mat-datepicker-toggle matIconSuffix [for]="endPicker" />
          <mat-datepicker #endPicker />
        </mat-form-field>
        <button mat-raised-button color="primary" (click)="loadAnalytics()">
          <mat-icon>refresh</mat-icon> Refresh
        </button>
      </div>

      @if (loading()) {
        <div class="spinner-wrapper">
          <mat-progress-spinner mode="indeterminate" diameter="48" />
        </div>
      } @else if (analytics()) {
        <!-- Stats Cards -->
        <div class="stats-grid">
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">{{ analytics()!.totalApiCalls | number }}</div>
              <div class="stat-label">Total Requests</div>
            </mat-card-content>
          </mat-card>
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">{{ analytics()!.activeUsers | number }}</div>
              <div class="stat-label">Unique Users</div>
            </mat-card-content>
          </mat-card>
          <mat-card class="stat-card">
            <mat-card-content>
              <div class="stat-value">
                {{ analytics()!.activeUsers ? (analytics()!.totalApiCalls / analytics()!.activeUsers | number: '1.1-1') : '0' }}
              </div>
              <div class="stat-label">Avg Requests / User</div>
            </mat-card-content>
          </mat-card>
        </div>

        <!-- Provider Breakdown -->
        @if (providerUsage()) {
          <h3>Per-Provider Breakdown</h3>
          <mat-card>
            <table mat-table [dataSource]="providerUsage()!.providers" class="full-width">
              <ng-container matColumnDef="provider">
                <th mat-header-cell *matHeaderCellDef>Provider</th>
                <td mat-cell *matCellDef="let row">{{ row.provider }}</td>
              </ng-container>
              <ng-container matColumnDef="requests">
                <th mat-header-cell *matHeaderCellDef>Requests</th>
                <td mat-cell *matCellDef="let row">{{ row.requests | number }}</td>
              </ng-container>
              <ng-container matColumnDef="tokens">
                <th mat-header-cell *matHeaderCellDef>Tokens</th>
                <td mat-cell *matCellDef="let row">{{ row.tokens | number }}</td>
              </ng-container>
              <ng-container matColumnDef="cost">
                <th mat-header-cell *matHeaderCellDef>Cost</th>
                <td mat-cell *matCellDef="let row">{{ row.cost != null ? ('$' + (row.cost | number: '1.2-2')) : 'N/A' }}</td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="providerColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: providerColumns"></tr>
            </table>
          </mat-card>
        }
      }
    </div>
  `,
  styles: [`
    .analytics-container { padding: 24px; }
    .date-range { display: flex; gap: 16px; align-items: center; margin-bottom: 24px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card { text-align: center; }
    .stat-value { font-size: 2rem; font-weight: 600; color: #1976d2; }
    .stat-label { color: #666; margin-top: 4px; }
    .full-width { width: 100%; }
    .spinner-wrapper { display: flex; justify-content: center; padding: 48px; }
    h3 { margin-top: 24px; }
  `],
})
export class AnalyticsComponent implements OnInit {
  private readonly adminApi = inject(AdminApiService);

  readonly analytics = signal<SystemAnalyticsResponse | null>(null);
  readonly providerUsage = signal<UsageByProviderResponse | null>(null);
  readonly loading = signal(false);
  readonly providerColumns = ['provider', 'requests', 'tokens', 'cost'];

  startDate: Date | null = null;
  endDate: Date | null = null;

  ngOnInit(): void {
    // Default to last 30 days
    this.endDate = new Date();
    this.startDate = new Date();
    this.startDate.setDate(this.startDate.getDate() - 30);
    this.loadAnalytics();
  }

  loadAnalytics(): void {
    this.loading.set(true);
    const params = {
      startDate: this.startDate?.toISOString().split('T')[0],
      endDate: this.endDate?.toISOString().split('T')[0],
    };

    this.adminApi.getSystemAnalytics(params).subscribe({
      next: (res) => {
        this.analytics.set(res);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.adminApi.getUsageByProvider(params).subscribe({
      next: (res) => this.providerUsage.set(res),
    });
  }
}
