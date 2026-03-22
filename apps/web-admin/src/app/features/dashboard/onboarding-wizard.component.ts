import { CommonModule } from '@angular/common';
import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatStepperModule } from '@angular/material/stepper';
import {
  AdminApiService,
  OnboardingStatus,
  PROVIDER_OPTIONS,
} from '../../services/admin-api.service';

@Component({
  selector: 'tc-onboarding-wizard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './onboarding-wizard.component.html',
  styleUrl: './onboarding-wizard.component.scss',
})
export class OnboardingWizardComponent {
  private readonly adminApi = inject(AdminApiService);

  readonly steps = signal({
    apiKey: false,
    team: false,
    allowedDomains: false,
    defaultTeamId: false,
  });
  readonly saving = signal(false);
  readonly stepError = signal('');
  readonly onComplete = output();

  // Step 1
  apiKeyProvider = '';
  apiKeyValue = '';

  // Step 2
  teamName = '';
  teamDescription = '';
  private createdTeamId = '';

  readonly providerOptions = PROVIDER_OPTIONS;

  selectedAuthType: 'apiKey' | 'oauthToken' = 'apiKey';
  tokenHint = '';

  onProviderChange(): void {
    const provider = this.providerOptions.find(
      p => p.id === this.apiKeyProvider,
    );
    this.selectedAuthType = provider?.authType || 'apiKey';
    this.apiKeyValue = '';
    if (this.apiKeyProvider === 'anthropic-token') {
      this.tokenHint = 'Run `claude setup-token` and paste the token here';
    } else if (this.apiKeyProvider === 'openai-codex') {
      this.tokenHint = 'Paste your Codex access token here';
    } else {
      this.tokenHint = '';
    }
  }

  // Step 3
  emailDomain = '';

  /** Called by parent to set initial status */
  setStatus(status: OnboardingStatus): void {
    this.steps.set({ ...status.steps });
  }

  saveApiKey(): void {
    this.saving.set(true);
    this.stepError.set('');
    const selectedProvider = PROVIDER_OPTIONS.find(
      p => p.id === this.apiKeyProvider,
    );
    const effectiveProvider =
      selectedProvider?.effectiveId || this.apiKeyProvider;
    const payload: Record<string, unknown> = {
      provider: effectiveProvider,
      authType: this.selectedAuthType,
    };
    if (this.selectedAuthType === 'apiKey') {
      payload['key'] = this.apiKeyValue;
    } else {
      payload['token'] = this.apiKeyValue;
    }
    this.adminApi.addApiKey(payload).subscribe({
      next: () => {
        this.steps.update(s => ({ ...s, apiKey: true }));
        this.saving.set(false);
      },
      error: err => {
        this.stepError.set(err.error?.message || 'Failed to save credential');
        this.saving.set(false);
      },
    });
  }

  saveTeam(): void {
    this.saving.set(true);
    this.stepError.set('');
    this.adminApi
      .createTeam({ name: this.teamName, description: this.teamDescription })
      .subscribe({
        next: team => {
          this.createdTeamId = team.teamId;
          this.steps.update(s => ({ ...s, team: true }));
          this.saving.set(false);
        },
        error: err => {
          this.stepError.set(err.error?.message || 'Failed to create team');
          this.saving.set(false);
        },
      });
  }

  saveDomainConfig(): void {
    this.saving.set(true);
    this.stepError.set('');
    const domain = this.emailDomain.trim().toLowerCase();

    this.adminApi
      .updateGlobalConfig({ configKey: 'allowedDomains', value: [domain] })
      .subscribe({
        next: () => {
          this.steps.update(s => ({ ...s, allowedDomains: true }));
          if (this.createdTeamId) {
            this.adminApi
              .updateGlobalConfig({
                configKey: 'defaultTeamId',
                value: this.createdTeamId,
              })
              .subscribe({
                next: () => {
                  this.steps.update(s => ({ ...s, defaultTeamId: true }));
                  this.saving.set(false);
                },
                error: err => {
                  this.stepError.set(
                    err.error?.message || 'Failed to set default team',
                  );
                  this.saving.set(false);
                },
              });
          } else {
            this.saving.set(false);
          }
        },
        error: err => {
          this.stepError.set(
            err.error?.message || 'Failed to save domain config',
          );
          this.saving.set(false);
        },
      });
  }
}
