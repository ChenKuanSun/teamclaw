import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
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
export class LoginComponent implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);
  readonly router = inject(Router);
  readonly subs = new Subscription();
  readonly isAuthenticated$ = toObservable(this.authService.isAuthenticated);

  // Form state
  readonly email = signal('');
  readonly password = signal('');
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.subs.add(
      this.isAuthenticated$.subscribe(isAuthenticated => {
        if (isAuthenticated) {
          this.router.navigate(['/session']);
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
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
