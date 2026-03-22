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
import { TranslateModule } from '@ngx-translate/core';
import { UserIntegration } from '../../services/integrations.service';

@Component({
  selector: 'tc-user-cred-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslateModule,
  ],
  templateUrl: './user-cred-dialog.component.html',
  styleUrl: './user-cred-dialog.component.scss',
})
export class UserCredDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<UserCredDialogComponent>);
  readonly data = inject<{
    integrationName: string;
    schema: UserIntegration['credentialSchema'];
  }>(MAT_DIALOG_DATA);

  readonly values = signal<Record<string, string>>({});

  setValue(key: string, value: string): void {
    this.values.update(v => ({ ...v, [key]: value }));
  }

  isValid(): boolean {
    return (this.data.schema || [])
      .filter(f => f.required)
      .every(f => (this.values()[f.key] || '').trim().length > 0);
  }

  save(): void {
    this.dialogRef.close(this.values());
  }
}
