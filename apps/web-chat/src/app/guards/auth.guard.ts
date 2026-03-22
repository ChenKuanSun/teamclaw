import { inject } from '@angular/core';
import { type CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Auth guard - protects routes that require authentication.
 * Redirects to login if user is not authenticated.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);

  const isAuthenticated = authService.isAuthenticated();

  if (!isAuthenticated) {
    authService.redirectToLogin();
    return false;
  }

  return true;
};
