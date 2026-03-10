import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AdminAuthService);
  const router = inject(Router);

  // Already authenticated with valid access token
  if (authService.isAuthenticated()) {
    return true;
  }

  // Access token expired but refresh token exists - try to refresh
  if (authService.hasRefreshToken()) {
    const refreshSuccess = await authService.refreshAccessToken();
    if (refreshSuccess) {
      return true;
    }
  }

  // Store the attempted URL for redirecting after login (with validation)
  const currentUrl = window.location.pathname + window.location.search;
  if (currentUrl !== '/auth/login') {
    authService.setRedirectUrl(currentUrl);
  }

  router.navigateByUrl('/auth/login');
  return false;
};
