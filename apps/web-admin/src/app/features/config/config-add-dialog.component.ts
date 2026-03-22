import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'tc-config-add-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './config-add-dialog.component.html',
  styleUrl: './config-add-dialog.component.scss',
})
export class ConfigAddDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ConfigAddDialogComponent>);
  readonly key = signal('');
  readonly value = signal('');

  save(): void {
    this.dialogRef.close({ configKey: this.key().trim(), value: this.value() });
  }
}
