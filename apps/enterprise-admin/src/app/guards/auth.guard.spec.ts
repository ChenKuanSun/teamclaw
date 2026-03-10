import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authGuard } from './auth.guard';
import { AdminAuthService } from '../services/admin-auth.service';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

describe('authGuard', () => {
  let authService: jest.Mocked<AdminAuthService>;
  let router: jest.Mocked<Router>;

  const mockRoute = {} as ActivatedRouteSnapshot;
  const mockState = {} as RouterStateSnapshot;

  function setUrl(path: string) {
    window.history.pushState({}, '', path);
  }

  beforeEach(() => {
    authService = {
      isAuthenticated: jest.fn().mockReturnValue(false),
      hasRefreshToken: jest.fn().mockReturnValue(false),
      refreshAccessToken: jest.fn().mockResolvedValue(false),
      setRedirectUrl: jest.fn(),
    } as unknown as jest.Mocked<AdminAuthService>;

    router = {
      navigateByUrl: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<Router>;

    TestBed.configureTestingModule({
      providers: [
        { provide: AdminAuthService, useValue: authService },
        { provide: Router, useValue: router },
      ],
    });
  });

  afterEach(() => {
    // Reset URL back to root
    window.history.pushState({}, '', '/');
  });

  function runGuard(): Promise<boolean | import('@angular/router').UrlTree> {
    return TestBed.runInInjectionContext(() =>
      authGuard(mockRoute, mockState),
    ) as Promise<boolean>;
  }

  it('should allow authenticated user', async () => {
    authService.isAuthenticated.mockReturnValue(true);

    const result = await runGuard();

    expect(result).toBe(true);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
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

    setUrl('/dashboard');

    const result = await runGuard();

    expect(result).toBe(false);
    expect(authService.setRedirectUrl).toHaveBeenCalledWith('/dashboard');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/login');
  });

  it('should store redirect URL and redirect to login when unauthenticated', async () => {
    authService.isAuthenticated.mockReturnValue(false);
    authService.hasRefreshToken.mockReturnValue(false);

    setUrl('/users?page=2');

    const result = await runGuard();

    expect(result).toBe(false);
    expect(authService.setRedirectUrl).toHaveBeenCalledWith('/users?page=2');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/login');
  });

  it('should not store auth routes as redirect URL', async () => {
    authService.isAuthenticated.mockReturnValue(false);

    setUrl('/auth/login');

    const result = await runGuard();

    expect(result).toBe(false);
    expect(authService.setRedirectUrl).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/login');
  });

  it('should not store /auth/login as redirect URL', async () => {
    authService.isAuthenticated.mockReturnValue(false);

    setUrl('/auth/login');

    const result = await runGuard();

    expect(result).toBe(false);
    expect(authService.setRedirectUrl).not.toHaveBeenCalled();
  });
});
