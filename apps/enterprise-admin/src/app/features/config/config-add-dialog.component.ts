import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'tc-config-add-dialog',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Add Config Entry</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Key</mat-label>
        <input matInput [(ngModel)]="key" placeholder="e.g. allowedDomains" />
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Value</mat-label>
        <textarea matInput [(ngModel)]="value" rows="4" placeholder='e.g. ["company.com"]'></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" [disabled]="!key().trim()" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`.full-width { width: 100%; margin-bottom: 8px; }`],
})
export class ConfigAddDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ConfigAddDialogComponent>);
  readonly key = signal('');
  readonly value = signal('');

  save(): void {
    this.dialogRef.close({ configKey: this.key().trim(), value: this.value() });
  }
}
