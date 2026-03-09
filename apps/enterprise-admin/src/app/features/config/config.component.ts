import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import {
  AdminApiService,
  ConfigEntry,
  Team,
  AdminUser,
} from '../../services/admin-api.service';
import { ConfigEditDialogComponent } from './config-edit-dialog.component';

@Component({
  selector: 'tc-config',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTabsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatDialogModule,
  ],
  template: `
    <div class="config-container">
      <h2>Configuration</h2>

      <mat-tab-group (selectedTabChange)="onTabChange($event.index)">
        <!-- Global Config -->
        <mat-tab label="Global">
          <div class="tab-content">
            @if (loading()) {
              <div class="spinner-wrapper">
                <mat-progress-spinner mode="indeterminate" diameter="40" />
              </div>
            } @else {
              <mat-card>
                <table mat-table [dataSource]="configs()" class="full-width">
                  <ng-container matColumnDef="configKey">
                    <th mat-header-cell *matHeaderCellDef>Key</th>
                    <td mat-cell *matCellDef="let entry">{{ entry.configKey }}</td>
                  </ng-container>
                  <ng-container matColumnDef="value">
                    <th mat-header-cell *matHeaderCellDef>Value</th>
                    <td mat-cell *matCellDef="let entry" class="value-cell">
                      {{ entry.value | slice: 0 : 100 }}{{ entry.value.length > 100 ? '...' : '' }}
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="actions">
                    <th mat-header-cell *matHeaderCellDef>Actions</th>
                    <td mat-cell *matCellDef="let entry">
                      <button mat-icon-button color="primary" (click)="editConfig(entry)">
                        <mat-icon>edit</mat-icon>
                      </button>
                    </td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="configColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: configColumns"></tr>
                </table>
              </mat-card>
            }
          </div>
        </mat-tab>

        <!-- Team Config -->
        <mat-tab label="Team">
          <div class="tab-content">
            <mat-form-field appearance="outline" class="selector">
              <mat-label>Select Team</mat-label>
              <mat-select [(ngModel)]="selectedTeamId" (selectionChange)="loadTeamConfig()">
                @for (team of teams(); track team.teamId) {
                  <mat-option [value]="team.teamId">{{ team.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            @if (loading()) {
              <div class="spinner-wrapper">
                <mat-progress-spinner mode="indeterminate" diameter="40" />
              </div>
            } @else if (selectedTeamId) {
              <mat-card>
                <table mat-table [dataSource]="configs()" class="full-width">
                  <ng-container matColumnDef="configKey">
                    <th mat-header-cell *matHeaderCellDef>Key</th>
                    <td mat-cell *matCellDef="let entry">{{ entry.configKey }}</td>
                  </ng-container>
                  <ng-container matColumnDef="value">
                    <th mat-header-cell *matHeaderCellDef>Value</th>
                    <td mat-cell *matCellDef="let entry" class="value-cell">
                      {{ entry.value | slice: 0 : 100 }}{{ entry.value.length > 100 ? '...' : '' }}
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="actions">
                    <th mat-header-cell *matHeaderCellDef>Actions</th>
                    <td mat-cell *matCellDef="let entry">
                      <button mat-icon-button color="primary" (click)="editConfig(entry)">
                        <mat-icon>edit</mat-icon>
                      </button>
                    </td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="configColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: configColumns"></tr>
                </table>
              </mat-card>
            }
          </div>
        </mat-tab>

        <!-- User Config -->
        <mat-tab label="User">
          <div class="tab-content">
            <mat-form-field appearance="outline" class="selector">
              <mat-label>Select User</mat-label>
              <mat-select [(ngModel)]="selectedUserId" (selectionChange)="loadUserConfig()">
                @for (user of users(); track user.userId) {
                  <mat-option [value]="user.userId">{{ user.email }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            @if (loading()) {
              <div class="spinner-wrapper">
                <mat-progress-spinner mode="indeterminate" diameter="40" />
              </div>
            } @else if (selectedUserId) {
              <mat-card>
                <table mat-table [dataSource]="configs()" class="full-width">
                  <ng-container matColumnDef="configKey">
                    <th mat-header-cell *matHeaderCellDef>Key</th>
                    <td mat-cell *matCellDef="let entry">{{ entry.configKey }}</td>
                  </ng-container>
                  <ng-container matColumnDef="value">
                    <th mat-header-cell *matHeaderCellDef>Value</th>
                    <td mat-cell *matCellDef="let entry" class="value-cell">
                      {{ entry.value | slice: 0 : 100 }}{{ entry.value.length > 100 ? '...' : '' }}
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="actions">
                    <th mat-header-cell *matHeaderCellDef>Actions</th>
                    <td mat-cell *matCellDef="let entry">
                      <button mat-icon-button color="primary" (click)="editConfig(entry)">
                        <mat-icon>edit</mat-icon>
                      </button>
                    </td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="configColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: configColumns"></tr>
                </table>
              </mat-card>
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .config-container { padding: 24px; }
    .tab-content { padding: 16px 0; }
    .selector { width: 300px; margin-bottom: 16px; }
    .full-width { width: 100%; }
    .value-cell { max-width: 400px; word-break: break-all; }
    .spinner-wrapper { display: flex; justify-content: center; padding: 48px; }
  `],
})
export class ConfigComponent implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly dialog = inject(MatDialog);

  readonly configs = signal<ConfigEntry[]>([]);
  readonly teams = signal<Team[]>([]);
  readonly users = signal<AdminUser[]>([]);
  readonly loading = signal(false);
  readonly configColumns = ['configKey', 'value', 'actions'];

  selectedTeamId = '';
  selectedUserId = '';
  private activeTab = 0;

  ngOnInit(): void {
    this.loadGlobalConfig();
    this.loadTeamsAndUsers();
  }

  private loadTeamsAndUsers(): void {
    this.adminApi.queryTeams({ limit: 100 }).subscribe({
      next: (res) => this.teams.set(res.teams),
    });
    this.adminApi.queryUsers({ limit: 100 }).subscribe({
      next: (res) => this.users.set(res.users),
    });
  }

  onTabChange(index: number): void {
    this.activeTab = index;
    this.configs.set([]);
    if (index === 0) {
      this.loadGlobalConfig();
    } else if (index === 1 && this.selectedTeamId) {
      this.loadTeamConfig();
    } else if (index === 2 && this.selectedUserId) {
      this.loadUserConfig();
    }
  }

  loadGlobalConfig(): void {
    this.loading.set(true);
    this.adminApi.getGlobalConfig().subscribe({
      next: (res) => {
        this.configs.set(res.configs);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadTeamConfig(): void {
    if (!this.selectedTeamId) return;
    this.loading.set(true);
    this.adminApi.getTeamConfig(this.selectedTeamId).subscribe({
      next: (res) => {
        this.configs.set(res.configs);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadUserConfig(): void {
    if (!this.selectedUserId) return;
    this.loading.set(true);
    this.adminApi.getUserConfig(this.selectedUserId).subscribe({
      next: (res) => {
        this.configs.set(res.configs);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  editConfig(entry: ConfigEntry): void {
    const isLargeText =
      entry.configKey.includes('SOUL.md') || entry.configKey.includes('MEMORY.md');

    const dialogRef = this.dialog.open(ConfigEditDialogComponent, {
      width: isLargeText ? '720px' : '480px',
      data: { configKey: entry.configKey, value: entry.value, isLargeText },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.saveConfig(result);
      }
    });
  }

  private saveConfig(entry: ConfigEntry): void {
    this.loading.set(true);
    let save$;
    if (this.activeTab === 0) {
      save$ = this.adminApi.updateGlobalConfig(entry);
    } else if (this.activeTab === 1) {
      save$ = this.adminApi.updateTeamConfig(this.selectedTeamId, entry);
    } else {
      save$ = this.adminApi.updateUserConfig(this.selectedUserId, entry);
    }

    save$.subscribe({
      next: () => {
        if (this.activeTab === 0) this.loadGlobalConfig();
        else if (this.activeTab === 1) this.loadTeamConfig();
        else this.loadUserConfig();
      },
      error: () => this.loading.set(false),
    });
  }
}
