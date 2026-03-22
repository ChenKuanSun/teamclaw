/**
 * Reusable Confirm Dialog Component
 *
 * Supports optional confirmation input (like GitHub's "type repo name to delete")
 */

import { Component, inject, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
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
    MatInputModule,
  ],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
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
