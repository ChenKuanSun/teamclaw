import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AdminAuthService } from '../../services/admin-auth.service';

@Component({
  selector: 'tc-admin-callback',
  standalone: true,
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="callback-container">
      <mat-spinner diameter="48"></mat-spinner>
      <p>{{ message }}</p>
    </div>
  `,
  styles: `
    .callback-container {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      gap: 24px;
      background-color: var(--mat-sys-surface-container);
    }

    p {
      color: var(--mat-sys-on-surface-variant);
      font-size: 16px;
    }
  `,
})
export class CallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AdminAuthService);

  message = 'Processing authentication...';

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.queryParamMap.get('code');
    const state = this.route.snapshot.queryParamMap.get('state');
    const error = this.route.snapshot.queryParamMap.get('error');

    if (error) {
      this.message = `Authentication failed: ${error}`;
      setTimeout(() => this.router.navigateByUrl('/auth/login'), 3000);
      return;
    }

    if (!code || !state) {
      this.message = 'Invalid callback parameters';
      setTimeout(() => this.router.navigateByUrl('/auth/login'), 3000);
      return;
    }

    const success = await this.authService.handleCallback(code, state);
    if (!success) {
      this.message = 'Failed to complete authentication';
      setTimeout(() => this.router.navigateByUrl('/auth/login'), 3000);
    }
  }
}
