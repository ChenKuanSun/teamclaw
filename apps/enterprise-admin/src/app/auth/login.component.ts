import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AdminAuthService } from '../services/admin-auth.service';

@Component({
  selector: 'tc-admin-login',
  standalone: true,
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="login-container">
      <mat-card class="login-card">
        <mat-card-header>
          <mat-card-title>TeamClaw Admin</mat-card-title>
          <mat-card-subtitle>Sign in to access the admin panel</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          @if (authService.isLoading()) {
            <div class="loading">
              <mat-spinner diameter="40"></mat-spinner>
              <span>Signing in...</span>
            </div>
          } @else {
            <button mat-raised-button color="primary" (click)="login()" class="login-button">
              <mat-icon>login</mat-icon>
              Sign in with SSO
            </button>
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

    mat-card-content {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .login-button {
      width: 100%;
      height: 48px;
      font-size: 16px;
    }

    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
  `,
})
export class LoginComponent {
  readonly authService = inject(AdminAuthService);

  login() {
    this.authService.login();
  }
}
