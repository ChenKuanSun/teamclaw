import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AdminAuthService } from '../services/admin-auth.service';
import { environment } from '../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AdminAuthService);

  // Only add auth header for admin API requests
  // Use ID token for Cognito User Pools Authorizer (contains user claims)
  if (req.url.startsWith(environment.adminApiUrl)) {
    const token = authService.idToken();
    if (token) {
      req = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
  }

  return next(req).pipe(
    catchError((error) => {
      // Handle 401 Unauthorized - try refresh token first
      // Use service state to prevent concurrent refresh attempts (no global variable race condition)
      if (
        error.status === 401 &&
        req.url.startsWith(environment.adminApiUrl) &&
        !authService.isRefreshing()
      ) {
        authService.setRefreshing(true);

        return from(authService.refreshAccessToken()).pipe(
          switchMap((refreshSuccess) => {
            authService.setRefreshing(false);

            if (refreshSuccess) {
              // Retry the original request with new ID token
              const newToken = authService.idToken();
              const retryReq = req.clone({
                setHeaders: {
                  Authorization: `Bearer ${newToken}`,
                },
              });
              return next(retryReq);
            }

            // Refresh failed - sign out
            authService.signOut();
            return throwError(() => error);
          }),
          catchError((refreshError) => {
            authService.setRefreshing(false);
            authService.signOut();
            return throwError(() => refreshError);
          }),
        );
      }

      return throwError(() => error);
    }),
  );
};
