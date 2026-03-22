import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'tc-create-team-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './create-team-dialog.component.html',
  styleUrl: './create-team-dialog.component.scss',
})
export class CreateTeamDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<CreateTeamDialogComponent>);

  name = '';
  description = '';

  submit(): void {
    this.dialogRef.close({ name: this.name, description: this.description });
  }
}
