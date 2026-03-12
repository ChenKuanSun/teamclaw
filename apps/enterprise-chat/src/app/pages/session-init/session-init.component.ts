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
        <div class="error-state">
          <mat-icon class="error-icon">error_outline</mat-icon>
          <h2>Access Denied</h2>
          <p>{{ error() }}</p>
          <button mat-raised-button color="primary" (click)="retry()">Retry</button>
        </div>
      } @else {
        <div class="loading-state">
          <mat-progress-spinner mode="indeterminate" diameter="64" />
          <h2>{{ statusMessage() }}</h2>
          <p class="hint">This may take a moment...</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .session-init-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: var(--mat-sys-surface);
    }
    .loading-state, .error-state {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .error-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--mat-sys-error);
    }
    h2 { margin: 0; color: var(--mat-sys-on-surface); }
    .hint { color: var(--mat-sys-on-surface-variant); margin: 0; }
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
      this.router.navigate(['/chat']);
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
