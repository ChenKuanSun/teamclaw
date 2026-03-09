import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  AdminApiService,
  Team,
} from '../../services/admin-api.service';
import { CreateTeamDialogComponent } from './create-team-dialog.component';

@Component({
  selector: 'tc-teams',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatCardModule,
    MatProgressSpinnerModule,
    DatePipe,
  ],
  template: `
    <div class="teams-container">
      <div class="header">
        <h2>Teams</h2>
        <button mat-raised-button color="primary" (click)="openCreateDialog()">
          <mat-icon>add</mat-icon> Create Team
        </button>
      </div>

      @if (loading()) {
        <div class="spinner-wrapper">
          <mat-progress-spinner mode="indeterminate" diameter="48" />
        </div>
      } @else {
        <mat-card>
          <table mat-table [dataSource]="teams()" class="full-width">
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Name</th>
              <td mat-cell *matCellDef="let team">{{ team.name }}</td>
            </ng-container>

            <ng-container matColumnDef="membersCount">
              <th mat-header-cell *matHeaderCellDef>Members</th>
              <td mat-cell *matCellDef="let team">{{ team.memberIds?.length ?? 0 }}</td>
            </ng-container>

            <ng-container matColumnDef="createdAt">
              <th mat-header-cell *matHeaderCellDef>Created</th>
              <td mat-cell *matCellDef="let team">{{ team.createdAt | date: 'medium' }}</td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef>Actions</th>
              <td mat-cell *matCellDef="let team">
                <button mat-icon-button color="primary" (click)="viewTeam(team)">
                  <mat-icon>visibility</mat-icon>
                </button>
                <button mat-icon-button color="warn" (click)="deleteTeam(team)">
                  <mat-icon>delete</mat-icon>
                </button>
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
    .teams-container { padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .full-width { width: 100%; }
    .spinner-wrapper { display: flex; justify-content: center; padding: 48px; }
  `],
})
export class TeamsComponent implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  readonly teams = signal<Team[]>([]);
  readonly loading = signal(false);
  readonly displayedColumns = ['name', 'membersCount', 'createdAt', 'actions'];

  ngOnInit(): void {
    this.loadTeams();
  }

  loadTeams(): void {
    this.loading.set(true);
    this.adminApi.queryTeams().subscribe({
      next: (res) => {
        this.teams.set(res.teams);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(CreateTeamDialogComponent, {
      width: '480px',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loading.set(true);
        this.adminApi.createTeam(result).subscribe({
          next: () => this.loadTeams(),
          error: () => this.loading.set(false),
        });
      }
    });
  }

  viewTeam(team: Team): void {
    this.router.navigate(['/teams', team.teamId]);
  }

  deleteTeam(team: Team): void {
    if (!confirm(`Delete team "${team.name}"?`)) return;
    this.adminApi.deleteTeam(team.teamId).subscribe({
      next: () => this.loadTeams(),
    });
  }
}
