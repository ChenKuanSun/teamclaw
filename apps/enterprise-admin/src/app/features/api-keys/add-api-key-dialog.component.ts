import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';

interface ProviderOption {
  id: string;
  name: string;
  authType: 'apiKey' | 'oauthToken';
  /** Provider ID to store in Secrets Manager (maps variants to base provider) */
  effectiveId: string;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  { id: 'anthropic', name: 'Anthropic (API Key)', authType: 'apiKey', effectiveId: 'anthropic' },
  { id: 'anthropic-token', name: 'Anthropic (Setup Token)', authType: 'oauthToken', effectiveId: 'anthropic' },
  { id: 'openai', name: 'OpenAI (API Key)', authType: 'apiKey', effectiveId: 'openai' },
  { id: 'openai-codex', name: 'OpenAI Codex (Subscription)', authType: 'oauthToken', effectiveId: 'openai' },
  { id: 'google', name: 'Google Gemini', authType: 'apiKey', effectiveId: 'google' },
  { id: 'openrouter', name: 'OpenRouter', authType: 'apiKey', effectiveId: 'openrouter' },
  { id: 'mistral', name: 'Mistral', authType: 'apiKey', effectiveId: 'mistral' },
  { id: 'together', name: 'Together AI', authType: 'apiKey', effectiveId: 'together' },
  { id: 'groq', name: 'Groq', authType: 'apiKey', effectiveId: 'groq' },
  { id: 'xai', name: 'xAI (Grok)', authType: 'apiKey', effectiveId: 'xai' },
  { id: 'deepseek', name: 'DeepSeek', authType: 'apiKey', effectiveId: 'deepseek' },
  { id: 'fireworks', name: 'Fireworks AI', authType: 'apiKey', effectiveId: 'fireworks' },
];

@Component({
  selector: 'tc-add-api-key-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>Add API Key</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Provider</mat-label>
        <mat-select [(ngModel)]="selectedId" (selectionChange)="onProviderChange()" required>
          @for (p of providerOptions; track p.id) {
            <mat-option [value]="p.id">{{ p.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      @if (selectedOption?.authType === 'apiKey') {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>API Key</mat-label>
          <input matInput [(ngModel)]="credential" type="password" required />
        </mat-form-field>
      } @else if (selectedOption?.authType === 'oauthToken') {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Token</mat-label>
          <input matInput [(ngModel)]="credential" type="password"
            placeholder="Paste token here" required />
          @if (selectedId === 'anthropic-token') {
            <mat-hint>Run 'claude setup-token' and paste the token here</mat-hint>
          }
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary"
        [disabled]="!selectedId || !credential"
        (click)="submit()">Add</button>
    </mat-dialog-actions>
  `,
  styles: [`.full-width { width: 100%; }`],
})
export class AddApiKeyDialogComponent {
  readonly providerOptions = PROVIDER_OPTIONS;
  selectedId = '';
  credential = '';
  selectedOption: ProviderOption | undefined;

  constructor(private dialogRef: MatDialogRef<AddApiKeyDialogComponent>) {}

  onProviderChange(): void {
    this.selectedOption = PROVIDER_OPTIONS.find(p => p.id === this.selectedId);
    this.credential = '';
  }

  submit(): void {
    if (!this.selectedOption) return;
    const payload: Record<string, unknown> = {
      provider: this.selectedOption.effectiveId,
      authType: this.selectedOption.authType,
    };
    if (this.selectedOption.authType === 'apiKey') {
      payload['key'] = this.credential;
    } else {
      payload['token'] = this.credential;
    }
    this.dialogRef.close(payload);
  }
}
