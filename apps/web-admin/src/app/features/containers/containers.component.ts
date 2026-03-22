import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { AdminApiService, Container } from '../../services/admin-api.service';

@Component({
  selector: 'tc-containers',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatCardModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './containers.component.html',
  styleUrl: './containers.component.scss',
})
export class ContainersComponent implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly containers = signal<Container[]>([]);
  readonly loading = signal(false);
  readonly actionLoading = signal(false);
  readonly displayedColumns = ['userId', 'status', 'taskArn', 'actions'];
  statusFilter = '';

  ngOnInit(): void {
    this.loadContainers();
  }

  loadContainers(): void {
    this.loading.set(true);
    const params = this.statusFilter ? { status: this.statusFilter } : {};
    this.adminApi
      .queryContainers(params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.containers.set(res.containers);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  startContainer(container: Container): void {
    this.actionLoading.set(true);
    this.adminApi
      .startContainer(container.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionLoading.set(false);
          this.loadContainers();
        },
        error: () => this.actionLoading.set(false),
      });
  }

  stopContainer(container: Container): void {
    this.actionLoading.set(true);
    this.adminApi
      .stopContainer(container.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionLoading.set(false);
          this.loadContainers();
        },
        error: () => this.actionLoading.set(false),
      });
  }
}
