import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authGuard } from './auth.guard';
import { AdminAuthService } from '../services/admin-auth.service';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

describe('authGuard', () => {
  let authService: jest.Mocked<AdminAuthService>;
  let router: jest.Mocked<Router>;

  const mockRoute = {} as ActivatedRouteSnapshot;
  const mockState = { url: '/' } as RouterStateSnapshot;

  beforeEach(() => {
    authService = {
      isAuthenticated: jest.fn().mockReturnValue(false),
      hasRefreshToken: jest.fn().mockReturnValue(false),
      refreshAccessToken: jest.fn().mockResolvedValue(false),
      setRedirectUrl: jest.fn(),
    } as unknown as jest.Mocked<AdminAuthService>;

    router = {
      parseUrl: jest.fn((url: string) => ({ toString: () => url })),
    } as unknown as jest.Mocked<Router>;

    TestBed.configureTestingModule({
      providers: [
        { provide: AdminAuthService, useValue: authService },
        { provide: Router, useValue: router },
      ],
    });
  });

  function runGuard(): Promise<boolean | import('@angular/router').UrlTree> {
    return TestBed.runInInjectionContext(() =>
      authGuard(mockRoute, mockState),
    ) as Promise<boolean | import('@angular/router').UrlTree>;
  }

  it('should allow authenticated user', async () => {
    authService.isAuthenticated.mockReturnValue(true);

    const result = await runGuard();

    expect(result).toBe(true);
  });

  it('should try refresh when access token expired but refresh token exists', async () => {
    authService.isAuthenticated.mockReturnValue(false);
    authService.hasRefreshToken.mockReturnValue(true);
    authService.refreshAccessToken.mockResolvedValue(true);

    const result = await runGuard();

    expect(result).toBe(true);
    expect(authService.refreshAccessToken).toHaveBeenCalled();
  });

  it('should redirect to login when refresh fails', async () => {
    authService.isAuthenticated.mockReturnValue(false);
    authService.hasRefreshToken.mockReturnValue(true);
    authService.refreshAccessToken.mockResolvedValue(false);

    mockState.url = '/dashboard';

    const result = await runGuard();

    expect(result.toString()).toBe('/auth/login');
    expect(authService.setRedirectUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('should store redirect URL and redirect to login when unauthenticated', async () => {
    authService.isAuthenticated.mockReturnValue(false);
    authService.hasRefreshToken.mockReturnValue(false);

    mockState.url = '/users?page=2';

    const result = await runGuard();

    expect(result.toString()).toBe('/auth/login');
    expect(authService.setRedirectUrl).toHaveBeenCalledWith('/users?page=2');
  });

  it('should not store auth routes as redirect URL', async () => {
    authService.isAuthenticated.mockReturnValue(false);

    mockState.url = '/auth/login';

    const result = await runGuard();

    expect(result.toString()).toBe('/auth/login');
    expect(authService.setRedirectUrl).not.toHaveBeenCalled();
  });

  it('should not store /auth/login as redirect URL', async () => {
    authService.isAuthenticated.mockReturnValue(false);

    mockState.url = '/auth/login';

    const result = await runGuard();

    expect(result.toString()).toBe('/auth/login');
    expect(authService.setRedirectUrl).not.toHaveBeenCalled();
  });
});
