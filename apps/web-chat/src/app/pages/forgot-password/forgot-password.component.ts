import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'tc-forgot-password',
  standalone: true,
  imports: [
    FormsModule, RouterLink, MatCardModule, MatInputModule,
    MatButtonModule, MatFormFieldModule, MatProgressSpinnerModule, TranslateModule,
  ],
  templateUrl: './forgot-password.component.html',
  styleUrl: '../login/login.component.scss',
})
export class ForgotPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly email = signal('');
  readonly code = signal('');
  readonly newPassword = signal('');
  readonly confirmPassword = signal('');
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly isLoading = signal(false);
  readonly codeSent = signal(false);

  async sendCode(): Promise<void> {
    if (!this.email()) {
      this.errorMessage.set('Please enter your email');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    try {
      await this.auth.forgotPassword(this.email());
      this.codeSent.set(true);
    } catch (e: unknown) {
      this.errorMessage.set(e instanceof Error ? e.message : 'Failed to send code');
    } finally {
      this.isLoading.set(false);
    }
  }

  async resetPassword(): Promise<void> {
    if (!this.code() || !this.newPassword()) {
      this.errorMessage.set('Please fill in all fields');
      return;
    }
    if (this.newPassword() !== this.confirmPassword()) {
      this.errorMessage.set('Passwords do not match');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    try {
      await this.auth.confirmNewPassword(this.email(), this.code(), this.newPassword());
      this.successMessage.set('Password reset successful! Redirecting...');
      setTimeout(() => this.router.navigate(['/login']), 2000);
    } catch (e: unknown) {
      this.errorMessage.set(e instanceof Error ? e.message : 'Password reset failed');
    } finally {
      this.isLoading.set(false);
    }
  }
}
