import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'tc-login',
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
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  readonly authService = inject(AuthService);
  readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly isAuthenticated$ = toObservable(this.authService.isAuthenticated);

  // Form state
  readonly email = signal('');
  readonly password = signal('');
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.isAuthenticated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isAuthenticated => {
        if (isAuthenticated) {
          this.router.navigate(['/session']);
        }
      });
  }

  async submitLogin() {
    const email = this.email();
    const password = this.password();

    if (!email || !password) {
      this.errorMessage.set('Please enter email and password');
      return;
    }

    this.errorMessage.set('');
    try {
      await this.authService.login(email, password);
      this.router.navigate(['/session']);
    } catch (e: unknown) {
      this.errorMessage.set(e instanceof Error ? e.message : 'Login failed');
    }
  }
}
