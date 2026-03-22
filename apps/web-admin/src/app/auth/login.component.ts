import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AdminAuthService } from '../services/admin-auth.service';

type ViewState = 'login' | 'forgot' | 'reset';

@Component({
  selector: 'tc-admin-login',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  readonly authService = inject(AdminAuthService);
  view: ViewState = 'login';
  email = '';
  password = '';
  resetCode = '';
  newPassword = '';
  hidePassword = true;
  successMessage = '';

  async login() {
    if (this.email && this.password) {
      const success = await this.authService.login(this.email, this.password);
      if (!success) {
        this.password = '';
      }
    }
  }

  showForgotPassword() {
    this.authService.clearError();
    this.successMessage = '';
    this.view = 'forgot';
  }

  backToLogin() {
    this.authService.clearError();
    this.successMessage = '';
    this.password = '';
    this.resetCode = '';
    this.newPassword = '';
    this.view = 'login';
  }

  async sendResetCode() {
    if (!this.email) return;
    const success = await this.authService.forgotPassword(this.email);
    if (success) {
      this.view = 'reset';
    }
  }

  async resetPassword() {
    if (!this.resetCode || !this.newPassword) return;
    const success = await this.authService.confirmPassword(
      this.email,
      this.resetCode,
      this.newPassword,
    );
    if (success) {
      this.successMessage =
        'Password reset successfully. Redirecting to sign in...';
      this.resetCode = '';
      this.newPassword = '';
      setTimeout(() => {
        this.successMessage = '';
        this.view = 'login';
      }, 2000);
    }
  }
}
