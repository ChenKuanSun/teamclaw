import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

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
  templateUrl: './config-edit-dialog.component.html',
  styleUrl: './config-edit-dialog.component.scss',
})
export class ConfigEditDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ConfigEditDialogComponent>);
  readonly data = inject<ConfigEditDialogData>(MAT_DIALOG_DATA);
  value = this.data.value;

  save(): void {
    this.dialogRef.close({ configKey: this.data.configKey, value: this.value });
  }
}
