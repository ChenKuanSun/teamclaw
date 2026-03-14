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
  template: `
    <div class="login-container">
      <mat-card class="login-card">
        <mat-card-header>
          <mat-card-title>TeamClaw Admin</mat-card-title>
          <mat-card-subtitle>
            @switch (view) {
              @case ('login') { Sign in to access the admin panel }
              @case ('forgot') { Enter your email to receive a reset code }
              @case ('reset') { Enter the code sent to your email }
            }
          </mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          @switch (view) {
            @case ('login') {
              <form (ngSubmit)="login()" class="login-form">
                <mat-form-field appearance="outline">
                  <mat-label>Email</mat-label>
                  <input matInput type="email" [(ngModel)]="email" name="email"
                         required autocomplete="username" />
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Password</mat-label>
                  <input matInput [type]="hidePassword ? 'password' : 'text'"
                         [(ngModel)]="password" name="password"
                         required autocomplete="current-password" />
                  <button mat-icon-button matSuffix type="button"
                          (click)="hidePassword = !hidePassword">
                    <mat-icon>{{ hidePassword ? 'visibility_off' : 'visibility' }}</mat-icon>
                  </button>
                </mat-form-field>

                @if (authService.error()) {
                  <div class="error-message">{{ authService.error() }}</div>
                }

                <button mat-raised-button color="primary" type="submit"
                        class="login-button"
                        [disabled]="authService.isLoading() || !email || !password">
                  @if (authService.isLoading()) {
                    <mat-spinner diameter="20"></mat-spinner>
                  } @else {
                    Sign in
                  }
                </button>

                <button mat-button type="button" class="forgot-link"
                        (click)="showForgotPassword()">
                  Forgot password?
                </button>
              </form>
            }

            @case ('forgot') {
              <form (ngSubmit)="sendResetCode()" class="login-form">
                <mat-form-field appearance="outline">
                  <mat-label>Email</mat-label>
                  <input matInput type="email" [(ngModel)]="email" name="email"
                         required autocomplete="username" />
                </mat-form-field>

                @if (authService.error()) {
                  <div class="error-message">{{ authService.error() }}</div>
                }

                <button mat-raised-button color="primary" type="submit"
                        class="login-button"
                        [disabled]="authService.isLoading() || !email">
                  @if (authService.isLoading()) {
                    <mat-spinner diameter="20"></mat-spinner>
                  } @else {
                    Send reset code
                  }
                </button>

                <button mat-button type="button" class="forgot-link"
                        (click)="backToLogin()">
                  Back to sign in
                </button>
              </form>
            }

            @case ('reset') {
              <form (ngSubmit)="resetPassword()" class="login-form">
                <mat-form-field appearance="outline">
                  <mat-label>Verification code</mat-label>
                  <input matInput type="text" [(ngModel)]="resetCode" name="code"
                         required autocomplete="one-time-code" />
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>New password</mat-label>
                  <input matInput [type]="hidePassword ? 'password' : 'text'"
                         [(ngModel)]="newPassword" name="newPassword"
                         required autocomplete="new-password" />
                  <button mat-icon-button matSuffix type="button"
                          (click)="hidePassword = !hidePassword">
                    <mat-icon>{{ hidePassword ? 'visibility_off' : 'visibility' }}</mat-icon>
                  </button>
                </mat-form-field>

                @if (authService.error()) {
                  <div class="error-message">{{ authService.error() }}</div>
                }

                @if (successMessage) {
                  <div class="success-message">{{ successMessage }}</div>
                }

                <button mat-raised-button color="primary" type="submit"
                        class="login-button"
                        [disabled]="authService.isLoading() || !resetCode || !newPassword">
                  @if (authService.isLoading()) {
                    <mat-spinner diameter="20"></mat-spinner>
                  } @else {
                    Reset password
                  }
                </button>

                <button mat-button type="button" class="forgot-link"
                        (click)="backToLogin()">
                  Back to sign in
                </button>
              </form>
            }
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .login-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background-color: var(--mat-sys-surface-container);
    }

    .login-card {
      width: 100%;
      max-width: 400px;
      padding: 24px;
    }

    mat-card-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 24px;
    }

    mat-card-title {
      font-size: 28px;
      font-weight: 600;
    }

    mat-card-subtitle {
      margin-top: 8px;
    }

    .login-form {
      display: flex;
      flex-direction: column;
      width: 100%;
    }

    mat-form-field {
      width: 100%;
    }

    .error-message {
      color: var(--mat-sys-error);
      font-size: 14px;
      margin-bottom: 16px;
      text-align: center;
    }

    .success-message {
      color: var(--mat-sys-primary);
      font-size: 14px;
      margin-bottom: 16px;
      text-align: center;
    }

    .login-button {
      width: 100%;
      height: 48px;
      font-size: 16px;
    }

    .login-button mat-spinner {
      display: inline-block;
    }

    .forgot-link {
      margin-top: 8px;
      align-self: center;
    }
  `,
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
      this.successMessage = 'Password reset successfully. Redirecting to sign in...';
      this.resetCode = '';
      this.newPassword = '';
      setTimeout(() => {
        this.successMessage = '';
        this.view = 'login';
      }, 2000);
    }
  }
}
