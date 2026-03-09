import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';

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
        <mat-select [(ngModel)]="provider" required>
          <mat-option value="anthropic">Anthropic</mat-option>
          <mat-option value="openai">OpenAI</mat-option>
          <mat-option value="google">Google</mat-option>
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>API Key</mat-label>
        <input matInput [(ngModel)]="key" type="password" required />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" [disabled]="!provider || !key" (click)="submit()">Add</button>
    </mat-dialog-actions>
  `,
  styles: [`.full-width { width: 100%; }`],
})
export class AddApiKeyDialogComponent {
  provider = '';
  key = '';

  constructor(private dialogRef: MatDialogRef<AddApiKeyDialogComponent>) {}

  submit(): void {
    this.dialogRef.close({ provider: this.provider, key: this.key });
  }
}
