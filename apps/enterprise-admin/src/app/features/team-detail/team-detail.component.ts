import { Component, inject, input, signal, OnInit, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import {
  AdminApiService,
  Team,
  AdminUser,
} from '../../services/admin-api.service';

@Component({
  selector: 'tc-team-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    DatePipe,
  ],
  template: `
    <div class="team-detail-container">
      @if (loading()) {
        <div class="spinner-wrapper">
          <mat-progress-spinner mode="indeterminate" diameter="48" />
        </div>
      } @else if (team()) {
        <div class="header">
          <button mat-icon-button (click)="goBack()">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <h2>{{ team()!.name }}</h2>
          <button mat-raised-button color="primary" (click)="toggleEdit()">
            <mat-icon>{{ editing() ? 'close' : 'edit' }}</mat-icon>
            {{ editing() ? 'Cancel' : 'Edit' }}
          </button>
        </div>

        <mat-card class="info-card">
          @if (editing()) {
            <mat-card-content>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Name</mat-label>
                <input matInput [(ngModel)]="editName" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Description</mat-label>
                <textarea matInput [(ngModel)]="editDescription" rows="3"></textarea>
              </mat-form-field>
              <button mat-raised-button color="primary" (click)="saveEdit()">Save</button>
            </mat-card-content>
          } @else {
            <mat-card-content>
              <p><strong>Description:</strong> {{ team()!.description || 'N/A' }}</p>
              <p><strong>Created:</strong> {{ team()!.createdAt | date: 'medium' }}</p>
              <p><strong>Members:</strong> {{ team()!.memberIds?.length ?? 0 }}</p>
            </mat-card-content>
          }
        </mat-card>

        <div class="member-actions">
          <mat-form-field appearance="outline" class="member-select">
            <mat-label>Add Member</mat-label>
            <mat-select [(ngModel)]="selectedUserId">
              @for (user of availableUsers(); track user.userId) {
                <mat-option [value]="user.userId">{{ user.email }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <button mat-raised-button color="primary" [disabled]="!selectedUserId" (click)="addMember()">
            <mat-icon>person_add</mat-icon> Add
          </button>
        </div>

        <h3>Members</h3>
        <mat-card>
          <table mat-table [dataSource]="members()" class="full-width">
            <ng-container matColumnDef="email">
              <th mat-header-cell *matHeaderCellDef>Email</th>
              <td mat-cell *matCellDef="let member">{{ member.email }}</td>
            </ng-container>

            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let member">
                <mat-chip [highlighted]="member.status === 'active'">
                  {{ member.status }}
                </mat-chip>
              </td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef>Actions</th>
              <td mat-cell *matCellDef="let member">
                <button mat-icon-button color="warn" (click)="removeMember(member)">
                  <mat-icon>person_remove</mat-icon>
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="memberColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: memberColumns"></tr>
          </table>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .team-detail-container { padding: 24px; }
    .header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
    .header h2 { flex: 1; margin: 0; }
    .info-card { margin-bottom: 24px; }
    .full-width { width: 100%; }
    .spinner-wrapper { display: flex; justify-content: center; padding: 48px; }
    h3 { margin-top: 24px; }
    .member-actions { display: flex; align-items: center; gap: 16px; margin-top: 24px; }
    .member-select { width: 300px; }
  `],
})
export class TeamDetailComponent implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly router = inject(Router);

  readonly teamId = input.required<string>();
  readonly team = signal<Team | null>(null);
  readonly members = signal<AdminUser[]>([]);
  readonly loading = signal(false);
  readonly editing = signal(false);
  readonly memberColumns = ['email', 'status', 'actions'];

  readonly availableUsers = signal<AdminUser[]>([]);
  selectedUserId = '';
  editName = '';
  editDescription = '';

  constructor() {
    effect(() => {
      const id = this.teamId();
      if (id) this.loadTeam(id);
    });
  }

  ngOnInit(): void {
    // Effect handles loading based on teamId input
  }

  loadTeam(teamId: string): void {
    this.loading.set(true);
    this.adminApi.getTeam(teamId).subscribe({
      next: (team) => {
        this.team.set(team);
        this.loading.set(false);
        this.loadMembers(team);
        this.loadAvailableUsers(team);
      },
      error: () => this.loading.set(false),
    });
  }

  private loadMembers(team: Team): void {
    if (!team.memberIds?.length) {
      this.members.set([]);
      return;
    }
    // Load members by querying users — each member looked up individually
    const memberUsers: AdminUser[] = [];
    for (const userId of team.memberIds) {
      this.adminApi.getUser(userId).subscribe({
        next: (user) => {
          memberUsers.push(user);
          this.members.set([...memberUsers]);
        },
      });
    }
  }

  private loadAvailableUsers(team: Team): void {
    this.adminApi.queryUsers({ limit: 100 }).subscribe({
      next: (res) => {
        const memberSet = new Set(team.memberIds ?? []);
        this.availableUsers.set(res.users.filter(u => !memberSet.has(u.userId)));
      },
    });
  }

  addMember(): void {
    if (!this.selectedUserId) return;
    const currentTeam = this.team();
    if (!currentTeam) return;
    const updatedIds = [...(currentTeam.memberIds ?? []), this.selectedUserId];
    this.adminApi.updateTeam(currentTeam.teamId, { memberIds: updatedIds }).subscribe({
      next: () => {
        this.selectedUserId = '';
        this.loadTeam(currentTeam.teamId);
      },
    });
  }

  toggleEdit(): void {
    if (!this.editing()) {
      this.editName = this.team()?.name ?? '';
      this.editDescription = this.team()?.description ?? '';
    }
    this.editing.update((v) => !v);
  }

  saveEdit(): void {
    const teamId = this.teamId();
    this.adminApi
      .updateTeam(teamId, { name: this.editName, description: this.editDescription })
      .subscribe({
        next: () => {
          this.editing.set(false);
          this.loadTeam(teamId);
        },
      });
  }

  removeMember(member: AdminUser): void {
    if (!confirm(`Remove ${member.email} from team?`)) return;
    const currentTeam = this.team();
    if (!currentTeam) return;
    const updatedIds = (currentTeam.memberIds ?? []).filter((id) => id !== member.userId);
    this.adminApi.updateTeam(currentTeam.teamId, { memberIds: updatedIds }).subscribe({
      next: () => this.loadTeam(currentTeam.teamId),
    });
  }

  goBack(): void {
    this.router.navigate(['/teams']);
  }
}
