import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

export interface ConfigEditDialogData {
  configKey: string;
  value: string;
  isLargeText: boolean;
}

@Component({
  selector: 'tc-config-edit-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>Edit Config</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Key</mat-label>
        <input matInput [value]="data.configKey" disabled />
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Value</mat-label>
        @if (data.isLargeText) {
          <textarea matInput [(ngModel)]="value" rows="15" class="monospace"></textarea>
        } @else {
          <textarea matInput [(ngModel)]="value" rows="4"></textarea>
        }
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width { width: 100%; }
    .monospace { font-family: monospace; font-size: 13px; }
  `],
})
export class ConfigEditDialogComponent {
  readonly data = inject<ConfigEditDialogData>(MAT_DIALOG_DATA);
  value: string;

  constructor(private dialogRef: MatDialogRef<ConfigEditDialogComponent>) {
    this.value = this.data.value;
  }

  save(): void {
    this.dialogRef.close({ configKey: this.data.configKey, value: this.value });
  }
}
