import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import {
  SessionResponse,
  SessionService,
} from '../../services/session.service';

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
  templateUrl: './session-init.component.html',
  styleUrl: './session-init.component.scss',
})
export class SessionInitComponent implements OnInit, OnDestroy {
  private readonly sessionService = inject(SessionService);
  private readonly router = inject(Router);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollCount = 0;
  private readonly MAX_POLLS = 60; // 60 × 3s = 3 minutes max

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
    this.pollCount++;
    if (this.pollCount > this.MAX_POLLS) {
      this.stopPolling();
      this.error.set('Timed out waiting for your workspace. Please try again.');
      return;
    }
    this.sessionService.initSession().subscribe({
      next: res => this.handleResponse(res),
      error: (err: HttpErrorResponse) => {
        if (err.status === 403) {
          this.error.set(
            err.error?.message ||
              'Your email domain is not authorized. Please contact your IT administrator.',
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
    this.stopPolling();
    this.pollCount = 0;
    this.checkSession();
  }
}
