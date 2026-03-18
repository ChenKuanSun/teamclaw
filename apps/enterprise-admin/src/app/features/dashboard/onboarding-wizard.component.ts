import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatStepperModule } from '@angular/material/stepper';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  AdminApiService,
  OnboardingStatus,
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
  template: `
    <div class="onboarding-container">
      <h1>Welcome to TeamClaw</h1>
      <p class="subtitle">Let's set up your AI workspace. This only takes a minute.</p>

      <mat-stepper [linear]="true" #stepper>
        <!-- Step 1: API Key -->
        <mat-step [completed]="steps().apiKey" [editable]="!steps().apiKey">
          <ng-template matStepLabel>Add API Key</ng-template>
          <div class="step-content">
            <p>Add at least one AI provider API key so OpenClaw can function.</p>
            @if (steps().apiKey) {
              <div class="step-done">
                <mat-icon>check_circle</mat-icon>
                <span>API key configured</span>
              </div>
            } @else {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Provider</mat-label>
                <mat-select [(ngModel)]="apiKeyProvider" (selectionChange)="onProviderChange()">
                  @for (p of providerOptions; track p.id) {
                    <mat-option [value]="p.id">{{ p.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              @if (selectedAuthType === 'apiKey') {
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>API Key</mat-label>
                  <input matInput [(ngModel)]="apiKeyValue" type="password" />
                </mat-form-field>
              } @else if (selectedAuthType === 'oauthToken') {
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Token</mat-label>
                  <input matInput [(ngModel)]="apiKeyValue" type="password"
                    placeholder="Paste token here" />
                  <mat-hint>{{ tokenHint }}</mat-hint>
                </mat-form-field>
              }
              <button mat-raised-button color="primary"
                [disabled]="!apiKeyProvider || !apiKeyValue || saving()"
                (click)="saveApiKey()">
                @if (saving()) { <mat-spinner diameter="20" /> } @else { Save Key }
              </button>
            }
            @if (stepError()) {
              <p class="error">{{ stepError() }}</p>
            }
            <div class="step-actions">
              <button mat-button matStepperNext [disabled]="!steps().apiKey">Next</button>
            </div>
          </div>
        </mat-step>

        <!-- Step 2: Create Team -->
        <mat-step [completed]="steps().team" [editable]="!steps().team">
          <ng-template matStepLabel>Create Team</ng-template>
          <div class="step-content">
            <p>Create your first team. Employees will be auto-assigned to this team.</p>
            @if (steps().team) {
              <div class="step-done">
                <mat-icon>check_circle</mat-icon>
                <span>Team created</span>
              </div>
            } @else {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Team Name</mat-label>
                <input matInput [(ngModel)]="teamName" placeholder="e.g. Engineering" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Description (optional)</mat-label>
                <textarea matInput [(ngModel)]="teamDescription" rows="2"></textarea>
              </mat-form-field>
              <button mat-raised-button color="primary"
                [disabled]="!teamName || saving()"
                (click)="saveTeam()">
                @if (saving()) { <mat-spinner diameter="20" /> } @else { Create Team }
              </button>
            }
            @if (stepError()) {
              <p class="error">{{ stepError() }}</p>
            }
            <div class="step-actions">
              <button mat-button matStepperPrevious>Back</button>
              <button mat-button matStepperNext [disabled]="!steps().team">Next</button>
            </div>
          </div>
        </mat-step>

        <!-- Step 3: Allowed Domains -->
        <mat-step [completed]="steps().allowedDomains && steps().defaultTeamId">
          <ng-template matStepLabel>Set Allowed Domains</ng-template>
          <div class="step-content">
            <p>Enter your company email domain. Employees with this domain can self-register and use OpenClaw.</p>
            @if (steps().allowedDomains && steps().defaultTeamId) {
              <div class="step-done">
                <mat-icon>check_circle</mat-icon>
                <span>Domain configured</span>
              </div>
            } @else {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Company Email Domain</mat-label>
                <input matInput [(ngModel)]="emailDomain" placeholder="company.com" />
              </mat-form-field>
              <button mat-raised-button color="primary"
                [disabled]="!emailDomain || saving()"
                (click)="saveDomainConfig()">
                @if (saving()) { <mat-spinner diameter="20" /> } @else { Save }
              </button>
            }
            @if (stepError()) {
              <p class="error">{{ stepError() }}</p>
            }
            <div class="step-actions">
              <button mat-button matStepperPrevious>Back</button>
              <button mat-button matStepperNext
                [disabled]="!steps().allowedDomains || !steps().defaultTeamId">Next</button>
            </div>
          </div>
        </mat-step>

        <!-- Step 4: Done -->
        <mat-step>
          <ng-template matStepLabel>Done</ng-template>
          <div class="step-content done-content">
            <mat-icon class="done-icon">celebration</mat-icon>
            <h2>You're all set!</h2>
            <p>TeamClaw is ready. Employees can now sign up with their company email and start using AI.</p>
            <button mat-raised-button color="primary" (click)="onComplete.emit()">
              Go to Dashboard
            </button>
          </div>
        </mat-step>
      </mat-stepper>
    </div>
  `,
  styles: [`
    .onboarding-container { padding: 24px; max-width: 720px; margin: 0 auto; }
    h1 { margin-bottom: 8px; }
    .subtitle { color: var(--mat-sys-on-surface-variant); margin-bottom: 32px; }
    .step-content { padding: 16px 0; max-width: 480px; }
    .step-actions { display: flex; gap: 8px; margin-top: 24px; }
    .full-width { width: 100%; }
    .step-done { display: flex; align-items: center; gap: 8px; color: var(--mat-sys-primary); margin: 16px 0; }
    .error { color: var(--mat-sys-error); margin-top: 8px; }
    .done-content { text-align: center; padding: 32px 0; }
    .done-icon { font-size: 64px; width: 64px; height: 64px; color: var(--mat-sys-primary); }
  `],
})
export class OnboardingWizardComponent {
  private readonly adminApi = inject(AdminApiService);

  readonly steps = signal({ apiKey: false, team: false, allowedDomains: false, defaultTeamId: false });
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

  readonly providerOptions = [
    { id: 'anthropic', name: 'Anthropic (API Key)', authType: 'apiKey' as const },
    { id: 'anthropic-token', name: 'Anthropic (Setup Token)', authType: 'oauthToken' as const },
    { id: 'openai', name: 'OpenAI (API Key)', authType: 'apiKey' as const },
    { id: 'openai-codex', name: 'OpenAI Codex (Subscription)', authType: 'oauthToken' as const },
    { id: 'google', name: 'Google Gemini', authType: 'apiKey' as const },
    { id: 'openrouter', name: 'OpenRouter', authType: 'apiKey' as const },
    { id: 'mistral', name: 'Mistral', authType: 'apiKey' as const },
    { id: 'together', name: 'Together AI', authType: 'apiKey' as const },
    { id: 'groq', name: 'Groq', authType: 'apiKey' as const },
    { id: 'xai', name: 'xAI (Grok)', authType: 'apiKey' as const },
    { id: 'deepseek', name: 'DeepSeek', authType: 'apiKey' as const },
    { id: 'fireworks', name: 'Fireworks AI', authType: 'apiKey' as const },
  ];

  selectedAuthType: 'apiKey' | 'oauthToken' = 'apiKey';
  tokenHint = '';

  onProviderChange(): void {
    const provider = this.providerOptions.find(p => p.id === this.apiKeyProvider);
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
    // Map variant provider IDs to their base provider for sidecar lookup
    // e.g. 'anthropic-token' → 'anthropic', 'openai-codex' → 'openai'
    const providerIdMap: Record<string, string> = {
      'anthropic-token': 'anthropic',
      'openai-codex': 'openai',
    };
    const effectiveProvider = providerIdMap[this.apiKeyProvider] || this.apiKeyProvider;
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
      error: (err) => {
        this.stepError.set(err.error?.message || 'Failed to save credential');
        this.saving.set(false);
      },
    });
  }

  saveTeam(): void {
    this.saving.set(true);
    this.stepError.set('');
    this.adminApi.createTeam({ name: this.teamName, description: this.teamDescription }).subscribe({
      next: (team) => {
        this.createdTeamId = team.teamId;
        this.steps.update(s => ({ ...s, team: true }));
        this.saving.set(false);
      },
      error: (err) => {
        this.stepError.set(err.error?.message || 'Failed to create team');
        this.saving.set(false);
      },
    });
  }

  saveDomainConfig(): void {
    this.saving.set(true);
    this.stepError.set('');
    const domain = this.emailDomain.trim().toLowerCase();

    this.adminApi.updateGlobalConfig({ configKey: 'allowedDomains', value: [domain] }).subscribe({
      next: () => {
        this.steps.update(s => ({ ...s, allowedDomains: true }));
        if (this.createdTeamId) {
          this.adminApi.updateGlobalConfig({ configKey: 'defaultTeamId', value: this.createdTeamId }).subscribe({
            next: () => {
              this.steps.update(s => ({ ...s, defaultTeamId: true }));
              this.saving.set(false);
            },
            error: (err) => {
              this.stepError.set(err.error?.message || 'Failed to set default team');
              this.saving.set(false);
            },
          });
        } else {
          this.saving.set(false);
        }
      },
      error: (err) => {
        this.stepError.set(err.error?.message || 'Failed to save domain config');
        this.saving.set(false);
      },
    });
  }
}
