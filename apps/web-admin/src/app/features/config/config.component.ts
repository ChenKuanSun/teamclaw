import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import {
  AdminApiService,
  AdminUser,
  ConfigEntry,
  Team,
} from '../../services/admin-api.service';
import { ConfigAddDialogComponent } from './config-add-dialog.component';
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
  templateUrl: './config.component.html',
  styleUrl: './config.component.scss',
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
      next: res => this.teams.set(res.teams),
    });
    this.adminApi.queryUsers({ limit: 100 }).subscribe({
      next: res => this.users.set(res.users),
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
      next: res => {
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
      next: res => {
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
      next: res => {
        this.configs.set(res.configs);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  addConfig(): void {
    const dialogRef = this.dialog.open(ConfigAddDialogComponent, {
      width: '480px',
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) this.saveConfig(result);
    });
  }

  editConfig(entry: ConfigEntry): void {
    const isLargeText =
      entry.configKey.includes('SOUL.md') ||
      entry.configKey.includes('MEMORY.md');

    const dialogRef = this.dialog.open(ConfigEditDialogComponent, {
      width: isLargeText ? '720px' : '480px',
      data: { configKey: entry.configKey, value: entry.value, isLargeText },
    });

    dialogRef.afterClosed().subscribe(result => {
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
