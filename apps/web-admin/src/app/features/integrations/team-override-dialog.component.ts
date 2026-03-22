import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  AdminApiService,
  IntegrationCredentialField,
  Team,
} from '../../services/admin-api.service';

export interface TeamOverrideDialogData {
  integrationName: string;
  schema: IntegrationCredentialField[];
  existingTeamId?: string;
  existingEnabled?: boolean;
  existingAllowUserOverride?: boolean;
}

export interface TeamOverrideDialogResult {
  teamId: string;
  enabled: boolean;
  allowUserOverride: boolean;
  credentials?: Record<string, string>;
}

@Component({
  selector: 'tc-team-override-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  templateUrl: './team-override-dialog.component.html',
  styleUrl: './team-override-dialog.component.scss',
})
export class TeamOverrideDialogComponent implements OnInit {
  private readonly dialogRef = inject(
    MatDialogRef<TeamOverrideDialogComponent>,
  );
  private readonly adminApi = inject(AdminApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly data = inject<TeamOverrideDialogData>(MAT_DIALOG_DATA);

  readonly teams = signal<Team[]>([]);
  readonly credValues = signal<Record<string, string>>({});
  selectedTeamId = this.data.existingTeamId || '';
  enabled = this.data.existingEnabled ?? true;
  allowUserOverride = this.data.existingAllowUserOverride ?? true;

  ngOnInit(): void {
    if (!this.data.existingTeamId) {
      this.adminApi
        .queryTeams({ limit: 100 })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: res => this.teams.set(res.teams) });
    }
  }

  setCredValue(key: string, value: string): void {
    this.credValues.update(v => ({ ...v, [key]: value }));
  }
  canSave(): boolean {
    return !!this.selectedTeamId;
  }

  save(): void {
    const hasCred = Object.values(this.credValues()).some(
      v => v.trim().length > 0,
    );
    const result: TeamOverrideDialogResult = {
      teamId: this.selectedTeamId,
      enabled: this.enabled,
      allowUserOverride: this.allowUserOverride,
    };
    if (hasCred) result.credentials = this.credValues();
    this.dialogRef.close(result);
  }
}
