import { Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  AdminApiService,
  Container,
} from '../../services/admin-api.service';

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
  template: `
    <div class="containers-container">
      <div class="header">
        <h2>Containers</h2>
        <mat-form-field appearance="outline" class="status-filter">
          <mat-label>Status Filter</mat-label>
          <mat-select [(ngModel)]="statusFilter" (selectionChange)="loadContainers()">
            <mat-option value="">All</mat-option>
            <mat-option value="RUNNING">Running</mat-option>
            <mat-option value="STOPPED">Stopped</mat-option>
            <mat-option value="PROVISIONING">Provisioning</mat-option>
            <mat-option value="PENDING">Pending</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      @if (loading()) {
        <div class="spinner-wrapper">
          <mat-progress-spinner mode="indeterminate" diameter="48" />
        </div>
      } @else {
        <mat-card>
          <table mat-table [dataSource]="containers()" class="full-width">
            <ng-container matColumnDef="userId">
              <th mat-header-cell *matHeaderCellDef>User</th>
              <td mat-cell *matCellDef="let c">{{ c.userId }}</td>
            </ng-container>

            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let c">
                <mat-chip [class]="'status-' + c.status.toLowerCase()">
                  {{ c.status }}
                </mat-chip>
              </td>
            </ng-container>

            <ng-container matColumnDef="taskArn">
              <th mat-header-cell *matHeaderCellDef>Task ARN</th>
              <td mat-cell *matCellDef="let c">{{ c.taskArn ?? 'N/A' }}</td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef>Actions</th>
              <td mat-cell *matCellDef="let c">
                @if (c.status === 'STOPPED') {
                  <button mat-icon-button color="primary" (click)="startContainer(c)" [disabled]="actionLoading()">
                    <mat-icon>play_arrow</mat-icon>
                  </button>
                }
                @if (c.status === 'RUNNING') {
                  <button mat-icon-button color="warn" (click)="stopContainer(c)" [disabled]="actionLoading()">
                    <mat-icon>stop</mat-icon>
                  </button>
                }
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
          </table>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .containers-container { padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .status-filter { width: 200px; }
    .full-width { width: 100%; }
    .spinner-wrapper { display: flex; justify-content: center; padding: 48px; }
    .status-running { background-color: #c8e6c9 !important; }
    .status-stopped { background-color: #ffcdd2 !important; }
    .status-provisioning { background-color: #fff9c4 !important; }
    .status-pending { background-color: #e1f5fe !important; }
  `],
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
    this.adminApi.queryContainers(params).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.containers.set(res.containers);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  startContainer(container: Container): void {
    this.actionLoading.set(true);
    this.adminApi.startContainer(container.userId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.loadContainers();
      },
      error: () => this.actionLoading.set(false),
    });
  }

  stopContainer(container: Container): void {
    this.actionLoading.set(true);
    this.adminApi.stopContainer(container.userId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.loadContainers();
      },
      error: () => this.actionLoading.set(false),
    });
  }
}
