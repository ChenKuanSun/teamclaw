import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import {
  AdminApiService,
  IntegrationDefinition,
} from '../../services/admin-api.service';

@Component({
  selector: 'tc-integrations',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
  ],
  templateUrl: './integrations.component.html',
  styleUrl: './integrations.component.scss',
})
export class IntegrationsComponent implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly integrations = signal<IntegrationDefinition[]>([]);
  readonly loading = signal(false);
  readonly displayedColumns = [
    'icon',
    'name',
    'description',
    'category',
    'status',
    'actions',
  ];

  ngOnInit(): void {
    this.loadIntegrations();
  }

  loadIntegrations(): void {
    this.loading.set(true);
    this.adminApi
      .listIntegrations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.integrations.set(res.integrations);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  openDetail(integration: IntegrationDefinition): void {
    this.router.navigate(['/integrations', integration.integrationId]);
  }
}
