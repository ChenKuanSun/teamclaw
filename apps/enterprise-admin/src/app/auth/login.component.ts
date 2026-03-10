import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AdminAuthService } from '../services/admin-auth.service';

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
          <mat-card-subtitle>Sign in to access the admin panel</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
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
          </form>
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

    .login-button {
      width: 100%;
      height: 48px;
      font-size: 16px;
    }

    .login-button mat-spinner {
      display: inline-block;
    }
  `,
})
export class LoginComponent {
  readonly authService = inject(AdminAuthService);
  email = '';
  password = '';
  hidePassword = true;

  login() {
    if (this.email && this.password) {
      this.authService.login(this.email, this.password);
    }
  }
}
