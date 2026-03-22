import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'tc-verify',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatCardModule,
    MatInputModule,
    MatButtonModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    TranslateModule,
  ],
  templateUrl: './verify.component.html',
  styleUrl: './verify.component.scss',
})
export class VerifyComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly email = signal('');
  readonly code = signal('');
  readonly errorMessage = signal('');
  readonly isLoading = signal(false);
  readonly success = signal(false);

  ngOnInit(): void {
    const emailParam = this.route.snapshot.queryParamMap.get('email');
    if (emailParam) this.email.set(emailParam);
  }

  async submitVerify(): Promise<void> {
    if (!this.code()) {
      this.errorMessage.set('Please enter the verification code');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      await this.auth.confirmRegistration(this.email(), this.code());
      this.success.set(true);
      setTimeout(() => this.router.navigate(['/login']), 2000);
    } catch (e: unknown) {
      this.errorMessage.set(
        e instanceof Error ? e.message : 'Verification failed',
      );
    } finally {
      this.isLoading.set(false);
    }
  }
}
