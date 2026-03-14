import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { SessionService, SessionResponse } from '../../services/session.service';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'tc-session-init',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatButtonModule,
    TranslateModule,
  ],
  template: `
    <div class="session-init-container">
      @if (error()) {
        <div class="state-card">
          <div class="icon-wrap error-wrap">
            <mat-icon class="state-icon">error_outline</mat-icon>
          </div>
          <h2>Access Denied</h2>
          <p>{{ error() }}</p>
          <button mat-raised-button color="primary" (click)="retry()">
            <mat-icon>refresh</mat-icon>
            Retry
          </button>
        </div>
      } @else {
        <div class="state-card">
          <mat-progress-spinner mode="indeterminate" [diameter]="48" />
          <h2>{{ statusMessage() }}</h2>
          <p class="hint">This may take a moment while we prepare your workspace.</p>
          <div class="progress-steps">
            <span class="step" [class.active]="statusMessage().includes('Connecting')">Connecting</span>
            <span class="step-arrow">
              <mat-icon>chevron_right</mat-icon>
            </span>
            <span class="step" [class.active]="statusMessage().includes('Setting up') || statusMessage().includes('provisioning')">Setting up</span>
            <span class="step-arrow">
              <mat-icon>chevron_right</mat-icon>
            </span>
            <span class="step" [class.active]="statusMessage().includes('Starting')">Starting</span>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .session-init-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
      background: var(--bg-base);
      padding: var(--space-6);
    }
    .state-card {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-4);
      max-width: 400px;
    }
    .icon-wrap {
      width: 72px;
      height: 72px;
      border-radius: var(--radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .error-wrap {
      background: var(--semantic-critical-bg);
    }
    .state-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
      color: var(--semantic-critical);
    }
    h2 {
      margin: 0;
      color: var(--text-primary);
      font-size: var(--text-h2);
      font-weight: var(--weight-semibold);
    }
    p {
      color: var(--text-secondary);
      margin: 0;
      font-size: var(--text-body-sm);
      line-height: var(--leading-relaxed);
    }
    .hint {
      color: var(--text-tertiary);
    }
    .progress-steps {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      margin-top: var(--space-2);
    }
    .step {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: var(--weight-medium);
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-full);
      transition: all var(--transition-base);
    }
    .step.active {
      color: var(--accent);
      background: var(--accent-bg);
    }
    .step-arrow {
      color: var(--text-muted);
      display: flex;
      align-items: center;
      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
    }
  `],
})
export class SessionInitComponent implements OnInit, OnDestroy {
  private readonly sessionService = inject(SessionService);
  private readonly router = inject(Router);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly statusMessage = signal('Connecting...');
  readonly error = signal('');

  ngOnInit(): void {
    this.checkSession();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private checkSession(): void {
    this.error.set('');
    this.sessionService.initSession().subscribe({
      next: (res) => this.handleResponse(res),
      error: (err: HttpErrorResponse) => {
        if (err.status === 403) {
          this.error.set(
            err.error?.message || 'Your email domain is not authorized. Please contact your IT administrator.',
          );
        } else {
          this.error.set('Unable to connect. Please try again.');
        }
        this.stopPolling();
      },
    });
  }

  private handleResponse(res: SessionResponse): void {
    if (res.status === 'ready') {
      this.stopPolling();
      this.router.navigate(['/chat'], {
        queryParams: res.gatewayUrl ? { gw: res.gatewayUrl } : {},
      });
      return;
    }

    if (res.status === 'provisioning') {
      this.statusMessage.set(res.message || 'Setting up your workspace...');
    } else if (res.status === 'starting') {
      this.statusMessage.set('Starting your assistant...');
    }

    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => this.checkSession(), 3000);
    }
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  retry(): void {
    this.checkSession();
  }
}
