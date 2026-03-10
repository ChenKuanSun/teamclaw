/**
 * Reusable Confirm Dialog Component
 *
 * Supports optional confirmation input (like GitHub's "type repo name to delete")
 */

import { Component, inject, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: 'primary' | 'warn' | 'accent';
  icon?: string;
  /** If set, user must type this value to enable confirm button */
  requireConfirmation?: string;
  /** Label for the confirmation input field */
  confirmationLabel?: string;
}

@Component({
  selector: 'tc-admin-confirm-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule
],
  template: `
    <h2 mat-dialog-title>
      @if (data.icon) {
        <mat-icon [class]="'icon-' + (data.confirmColor || 'primary')">{{ data.icon }}</mat-icon>
      }
      {{ data.title }}
    </h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      @if (data.requireConfirmation) {
        <mat-form-field appearance="outline" class="confirmation-field">
          <mat-label>{{ data.confirmationLabel || 'Type to confirm' }}</mat-label>
          <input
            matInput
            [ngModel]="confirmationInput()"
            (ngModelChange)="confirmationInput.set($event)"
            [placeholder]="data.requireConfirmation"
            autocomplete="off" />
          <mat-hint>Type "{{ data.requireConfirmation }}" to confirm</mat-hint>
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ data.cancelText || 'Cancel' }}</button>
      <button
        mat-raised-button
        [color]="data.confirmColor || 'primary'"
        [disabled]="!canConfirm()"
        (click)="confirm()">
        {{ data.confirmText || 'Confirm' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    h2 {
      display: flex;
      align-items: center;
      gap: 8px;

      mat-icon {
        font-size: 24px;
        width: 24px;
        height: 24px;
      }

      .icon-warn {
        color: var(--mat-sys-error);
      }

      .icon-primary {
        color: var(--mat-sys-primary);
      }
    }

    p {
      color: var(--mat-sys-on-surface-variant);
      white-space: pre-wrap;
    }

    .confirmation-field {
      width: 100%;
      margin-top: 16px;
    }
  `,
})
export class ConfirmDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ConfirmDialogComponent>);
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);

  readonly confirmationInput = signal('');

  canConfirm(): boolean {
    if (!this.data.requireConfirmation) {
      return true;
    }
    return this.confirmationInput() === this.data.requireConfirmation;
  }

  confirm(): void {
    this.dialogRef.close(true);
  }
}
