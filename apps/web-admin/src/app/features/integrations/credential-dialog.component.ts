import { CommonModule } from '@angular/common';
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
import { IntegrationCredentialField } from '../../services/admin-api.service';

export interface CredentialDialogData {
  integrationName: string;
  scope: string;
  schema: IntegrationCredentialField[];
}

@Component({
  selector: 'tc-credential-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './credential-dialog.component.html',
  styleUrl: './credential-dialog.component.scss',
})
export class CredentialDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<CredentialDialogComponent>);
  readonly data = inject<CredentialDialogData>(MAT_DIALOG_DATA);
  readonly values = signal<Record<string, string>>({});

  setValue(key: string, value: string): void {
    this.values.update(v => ({ ...v, [key]: value }));
  }
  isValid(): boolean {
    return this.data.schema
      .filter(f => f.required)
      .every(f => (this.values()[f.key] || '').trim().length > 0);
  }
  save(): void {
    this.dialogRef.close(this.values());
  }
}
