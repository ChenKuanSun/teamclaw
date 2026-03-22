import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
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
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
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
      next: res => {
        this.analytics.set(res);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.adminApi.getUsageByProvider(params).subscribe({
      next: res => this.providerUsage.set(res),
    });
  }
}
