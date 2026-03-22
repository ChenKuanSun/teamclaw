import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AdminApiService,
  IntegrationDetail,
  TeamOverride,
} from '../../services/admin-api.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import {
  CredentialDialogComponent,
  CredentialDialogData,
} from './credential-dialog.component';
import {
  TeamOverrideDialogComponent,
  TeamOverrideDialogData,
  TeamOverrideDialogResult,
} from './team-override-dialog.component';

@Component({
  selector: 'tc-integration-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTableModule,
  ],
  templateUrl: './integration-detail.component.html',
  styleUrl: './integration-detail.component.scss',
})
export class IntegrationDetailComponent implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly detail = signal<IntegrationDetail | null>(null);
  readonly loading = signal(false);
  readonly teamColumns = [
    'team',
    'status',
    'credential',
    'userOverride',
    'actions',
  ];
  private integrationId = '';

  ngOnInit(): void {
    this.integrationId =
      this.route.snapshot.paramMap.get('integrationId') || '';
    this.loadDetail();
  }

  loadDetail(): void {
    this.loading.set(true);
    this.adminApi
      .getIntegration(this.integrationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.detail.set(res);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  goBack(): void {
    this.router.navigate(['/integrations']);
  }

  toggleEnabled(enabled: boolean): void {
    this.adminApi
      .updateIntegration(this.integrationId, { enabled })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notify('Updated');
          this.loadDetail();
        },
        error: e => this.notifyError(e),
      });
  }

  openCredentialDialog(scope: string): void {
    const d = this.detail();
    if (!d) return;
    this.dialog
      .open(CredentialDialogComponent, {
        width: '480px',
        data: {
          integrationName: d.displayName,
          scope,
          schema: d.credentialSchema,
        } as CredentialDialogData,
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        if (!result) return;
        this.adminApi
          .updateIntegration(this.integrationId, { credentials: result })
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.notify('Credential saved');
              this.loadDetail();
            },
            error: e => this.notifyError(e),
          });
      });
  }

  removeGlobalCred(): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Remove Credential',
          message: `Remove global credential for ${this.detail()?.displayName}?`,
          confirmText: 'Remove',
          confirmColor: 'warn',
          icon: 'vpn_key_off',
        },
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(ok => {
        if (!ok) return;
        this.adminApi
          .deleteIntegrationCred(this.integrationId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.notify('Removed');
              this.loadDetail();
            },
            error: e => this.notifyError(e),
          });
      });
  }

  openTeamOverrideDialog(existing?: TeamOverride): void {
    const d = this.detail();
    if (!d) return;
    this.dialog
      .open(TeamOverrideDialogComponent, {
        width: '520px',
        data: {
          integrationName: d.displayName,
          schema: d.credentialSchema,
          existingTeamId: existing?.teamId,
          existingEnabled: existing?.enabled,
          existingAllowUserOverride: existing?.allowUserOverride,
        } as TeamOverrideDialogData,
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r: TeamOverrideDialogResult | undefined) => {
        if (!r) return;
        this.adminApi
          .updateTeamOverride(this.integrationId, r.teamId, {
            enabled: r.enabled,
            allowUserOverride: r.allowUserOverride,
            credentials: r.credentials,
          })
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.notify('Team override saved');
              this.loadDetail();
            },
            error: e => this.notifyError(e),
          });
      });
  }

  editTeamOverride(row: TeamOverride): void {
    this.openTeamOverrideDialog(row);
  }

  toggleTeamUserOverride(row: TeamOverride, allow: boolean): void {
    this.adminApi
      .updateTeamOverride(this.integrationId, row.teamId, {
        allowUserOverride: allow,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notify('Updated');
          this.loadDetail();
        },
        error: e => this.notifyError(e),
      });
  }

  removeTeamCred(row: TeamOverride): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Remove Team Credential',
          message: `Remove credential for ${row.teamName || row.teamId}?`,
          confirmText: 'Remove',
          confirmColor: 'warn',
          icon: 'vpn_key_off',
        },
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(ok => {
        if (!ok) return;
        this.adminApi
          .deleteTeamCred(this.integrationId, row.teamId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.notify('Removed');
              this.loadDetail();
            },
            error: e => this.notifyError(e),
          });
      });
  }

  private notify(msg: string): void {
    this.snackBar.open(msg, 'OK', { duration: 2000 });
  }
  private notifyError(err: any): void {
    this.snackBar.open(err.error?.message || 'Failed', 'OK', {
      duration: 4000,
      panelClass: 'snackbar-error',
    });
  }
}
