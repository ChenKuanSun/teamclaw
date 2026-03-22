import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  provideRouter,
} from '@angular/router';
import { AuthService } from '../services/auth.service';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  let authService: {
    isAuthenticated: jest.Mock;
    redirectToLogin: jest.Mock;
  };

  const mockRoute = {} as ActivatedRouteSnapshot;
  const mockState = {} as RouterStateSnapshot;

  beforeEach(() => {
    authService = {
      isAuthenticated: jest.fn(),
      redirectToLogin: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authService },
        provideRouter([]),
      ],
    });
  });

  it('should allow access when user is authenticated', () => {
    authService.isAuthenticated.mockReturnValue(true);

    const result = TestBed.runInInjectionContext(() =>
      authGuard(mockRoute, mockState),
    );

    expect(result).toBe(true);
    expect(authService.redirectToLogin).not.toHaveBeenCalled();
  });

  it('should deny access and redirect to login when user is not authenticated', () => {
    authService.isAuthenticated.mockReturnValue(false);

    const result = TestBed.runInInjectionContext(() =>
      authGuard(mockRoute, mockState),
    );

    expect(result).toBe(false);
    expect(authService.redirectToLogin).toHaveBeenCalled();
  });
});
