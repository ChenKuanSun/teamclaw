import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'tc-signup',
  standalone: true,
  imports: [
    FormsModule, RouterLink, MatCardModule, MatInputModule,
    MatButtonModule, MatFormFieldModule, MatProgressSpinnerModule, TranslateModule,
  ],
  templateUrl: './signup.component.html',
  styleUrl: '../login/login.component.scss',
})
export class SignupComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly email = signal('');
  readonly password = signal('');
  readonly confirmPassword = signal('');
  readonly errorMessage = signal('');
  readonly isLoading = signal(false);

  async submitSignup(): Promise<void> {
    const email = this.email();
    const password = this.password();

    if (!email || !password) {
      this.errorMessage.set('Please fill in all fields');
      return;
    }
    if (password !== this.confirmPassword()) {
      this.errorMessage.set('Passwords do not match');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      await this.auth.signUp(email, password);
      this.router.navigate(['/verify'], { queryParams: { email } });
    } catch (e: unknown) {
      this.errorMessage.set(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      this.isLoading.set(false);
    }
  }
}
