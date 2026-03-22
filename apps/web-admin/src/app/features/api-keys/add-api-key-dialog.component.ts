import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  PROVIDER_OPTIONS,
  ProviderOption,
} from '../../services/admin-api.service';

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
  templateUrl: './add-api-key-dialog.component.html',
  styleUrl: './add-api-key-dialog.component.scss',
})
export class AddApiKeyDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<AddApiKeyDialogComponent>);

  readonly providerOptions = PROVIDER_OPTIONS;
  selectedId = '';
  credential = '';
  selectedOption: ProviderOption | undefined;

  onProviderChange(): void {
    this.selectedOption = PROVIDER_OPTIONS.find(p => p.id === this.selectedId);
    this.credential = '';
  }

  submit(): void {
    if (!this.selectedOption) return;
    const payload: Record<string, unknown> = {
      provider: this.selectedOption.effectiveId,
      authType: this.selectedOption.authType,
    };
    if (this.selectedOption.authType === 'apiKey') {
      payload['key'] = this.credential;
    } else {
      payload['token'] = this.credential;
    }
    this.dialogRef.close(payload);
  }
}
