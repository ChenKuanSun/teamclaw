import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'tc-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatInputModule, MatButtonModule, MatFormFieldModule],
  template: `
    <div class="login-container">
      <mat-card class="login-card">
        <mat-card-header>
          <mat-card-title>TeamClaw</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (error) {
            <div class="error">{{ error }}</div>
          }
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Email</mat-label>
            <input matInput [(ngModel)]="email" type="email" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Password</mat-label>
            <input matInput [(ngModel)]="password" type="password" (keyup.enter)="login()" />
          </mat-form-field>
        </mat-card-content>
        <mat-card-actions>
          <button mat-raised-button color="primary" class="full-width" [disabled]="loading" (click)="login()">
            {{ loading ? 'Signing in...' : 'Sign In' }}
          </button>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .login-container { display: flex; justify-content: center; align-items: center; height: 100vh; background: #f4f4f4; }
    .login-card { width: 400px; padding: 24px; }
    .full-width { width: 100%; }
    .error { color: #f44336; margin-bottom: 16px; padding: 8px; background: #ffebee; border-radius: 4px; }
  `],
})
export class LoginComponent {
  email = '';
  password = '';
  error = '';
  loading = false;

  constructor(private auth: AuthService, private router: Router) {}

  async login(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      await this.auth.login(this.email, this.password);
      this.router.navigate(['/chat']);
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Login failed';
    } finally {
      this.loading = false;
    }
  }
}
