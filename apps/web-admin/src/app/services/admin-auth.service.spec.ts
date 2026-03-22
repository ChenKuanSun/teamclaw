import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AdminAuthService } from './admin-auth.service';

// Mock amazon-cognito-identity-js
const mockAuthenticateUser = jest.fn();
const mockGetSession = jest.fn();
const mockSignOut = jest.fn();
const mockGetCurrentUser = jest.fn();

jest.mock('amazon-cognito-identity-js', () => {
  return {
    CognitoUserPool: jest.fn().mockImplementation(() => ({
      getCurrentUser: mockGetCurrentUser,
    })),
    CognitoUser: jest.fn().mockImplementation(() => ({
      authenticateUser: mockAuthenticateUser,
      getSession: mockGetSession,
      signOut: mockSignOut,
    })),
    AuthenticationDetails: jest.fn(),
  };
});

describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let router: jest.Mocked<Router>;

  const TOKEN_STORAGE_KEY = 'admin_auth_result';
  const REDIRECT_URL_KEY = 'admin_redirect_url';

  const mockIdToken =
    'eyJhbGciOiJIUzI1NiJ9.' +
    btoa(JSON.stringify({ email: 'admin@test.com' })) +
    '.sig';

  const mockSession = {
    isValid: () => true,
    getAccessToken: () => ({
      getJwtToken: () => 'mock-access-token',
      getExpiration: () => Math.floor(Date.now() / 1000) + 3600,
    }),
    getIdToken: () => ({
      getJwtToken: () => mockIdToken,
    }),
    getRefreshToken: () => ({
      getToken: () => 'mock-refresh-token',
    }),
  };

  function createService() {
    TestBed.configureTestingModule({
      providers: [
        AdminAuthService,
        { provide: Router, useValue: router },
      ],
    });
    service = TestBed.inject(AdminAuthService);
  }

  beforeEach(() => {
    sessionStorage.clear();
    jest.clearAllMocks();

    router = {
      navigateByUrl: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<Router>;

    mockGetCurrentUser.mockReturnValue(null);
    createService();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('initialization', () => {
    it('should start unauthenticated when sessionStorage is empty', () => {
      expect(service.isAuthenticated()).toBe(false);
      expect(service.accessToken()).toBe('');
      expect(service.idToken()).toBe('');
      expect(service.isLoading()).toBe(false);
    });

    it('should load valid tokens from sessionStorage', () => {
      const stored = {
        accessToken: 'stored-access',
        idToken: 'stored-id',
        refreshToken: 'stored-refresh',
        expiresAt: Date.now() + 300_000,
      };
      sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(stored));

      TestBed.resetTestingModule();
      createService();

      expect(service.isAuthenticated()).toBe(true);
      expect(service.accessToken()).toBe('stored-access');
      expect(service.idToken()).toBe('stored-id');
    });

    it('should keep refresh token but clear access token when expired', () => {
      const stored = {
        accessToken: 'expired-access',
        idToken: 'expired-id',
        refreshToken: 'valid-refresh',
        expiresAt: Date.now() - 100_000,
      };
      sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(stored));

      TestBed.resetTestingModule();
      createService();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.accessToken()).toBe('');
      expect(service.hasRefreshToken()).toBe(true);
    });

    it('should clear storage if no refresh token', () => {
      const stored = {
        accessToken: 'access',
        idToken: 'id',
        refreshToken: '',
        expiresAt: Date.now() + 300_000,
      };
      sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(stored));

      TestBed.resetTestingModule();
      createService();

      expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('should handle corrupted JSON gracefully', () => {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, 'not-valid-json{{{');

      TestBed.resetTestingModule();
      createService();

      expect(service.isAuthenticated()).toBe(false);
    });
  });

  describe('login()', () => {
    it('should authenticate and navigate to dashboard on success', async () => {
      mockAuthenticateUser.mockImplementation((_details: unknown, callbacks: { onSuccess: (session: typeof mockSession) => void }) => {
        callbacks.onSuccess(mockSession);
      });

      const result = await service.login('admin@test.com', 'Password123!');

      expect(result).toBe(true);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.accessToken()).toBe('mock-access-token');
      expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
      expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeTruthy();
    });

    it('should navigate to stored redirect URL after login', async () => {
      sessionStorage.setItem(REDIRECT_URL_KEY, '/users');

      mockAuthenticateUser.mockImplementation((_details: unknown, callbacks: { onSuccess: (session: typeof mockSession) => void }) => {
        callbacks.onSuccess(mockSession);
      });

      await service.login('admin@test.com', 'Password123!');

      expect(router.navigateByUrl).toHaveBeenCalledWith('/users');
      expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBeNull();
    });

    it('should set error on invalid credentials', async () => {
      mockAuthenticateUser.mockImplementation((_details: unknown, callbacks: { onFailure: (err: Error & { code?: string }) => void }) => {
        const err = new Error('Incorrect username or password.') as Error & { code?: string };
        err.code = 'NotAuthorizedException';
        callbacks.onFailure(err);
      });

      const result = await service.login('admin@test.com', 'wrong');

      expect(result).toBe(false);
      expect(service.isAuthenticated()).toBe(false);
      expect(service.error()).toBe('Invalid email or password.');
      expect(service.isLoading()).toBe(false);
    });

    it('should handle newPasswordRequired challenge', async () => {
      mockAuthenticateUser.mockImplementation((_details: unknown, callbacks: { newPasswordRequired: () => void }) => {
        callbacks.newPasswordRequired();
      });

      const result = await service.login('admin@test.com', 'Password123!');

      expect(result).toBe(false);
      expect(service.error()).toContain('Password change required');
    });

    it('should set isLoading during authentication', async () => {
      let resolveAuth: (session: typeof mockSession) => void;
      mockAuthenticateUser.mockImplementation((_details: unknown, callbacks: { onSuccess: (session: typeof mockSession) => void }) => {
        resolveAuth = callbacks.onSuccess;
      });

      const loginPromise = service.login('admin@test.com', 'Password123!');
      expect(service.isLoading()).toBe(true);

      resolveAuth!(mockSession);
      await loginPromise;

      expect(service.isLoading()).toBe(false);
    });
  });

  describe('refreshAccessToken()', () => {
    it('should return false when no current user', async () => {
      mockGetCurrentUser.mockReturnValue(null);
      const result = await service.refreshAccessToken();
      expect(result).toBe(false);
    });

    it('should refresh token via Cognito SDK', async () => {
      const mockUser = {
        getSession: (cb: (err: Error | null, session: typeof mockSession | null) => void) => {
          cb(null, mockSession);
        },
      };
      mockGetCurrentUser.mockReturnValue(mockUser);

      const result = await service.refreshAccessToken();

      expect(result).toBe(true);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.accessToken()).toBe('mock-access-token');
    });

    it('should sign out when refresh fails', async () => {
      const mockUser = {
        getSession: (cb: (err: Error | null, session: null) => void) => {
          cb(new Error('Refresh failed'), null);
        },
        signOut: jest.fn(),
      };
      mockGetCurrentUser.mockReturnValue(mockUser);

      const result = await service.refreshAccessToken();

      expect(result).toBe(false);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/login');
    });
  });

  describe('signOut()', () => {
    it('should clear state, storage, and navigate to login', () => {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, 'data');
      sessionStorage.setItem(REDIRECT_URL_KEY, '/users');

      service.signOut();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.accessToken()).toBe('');
      expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
      expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBeNull();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/login');
    });
  });

  describe('userEmail', () => {
    it('should decode email from id token', async () => {
      mockAuthenticateUser.mockImplementation((_details: unknown, callbacks: { onSuccess: (session: typeof mockSession) => void }) => {
        callbacks.onSuccess(mockSession);
      });

      await service.login('admin@test.com', 'Password123!');
      expect(service.userEmail()).toBe('admin@test.com');
    });

    it('should return empty string for missing id token', () => {
      expect(service.userEmail()).toBe('');
    });
  });

  describe('redirect URL validation', () => {
    it('should store valid redirect paths', () => {
      service.setRedirectUrl('/dashboard');
      expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBe('/dashboard');

      service.setRedirectUrl('/users?page=2');
      expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBe('/users?page=2');

      service.setRedirectUrl('/teams');
      expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBe('/teams');
    });

    it('should reject non-allowed paths', () => {
      service.setRedirectUrl('/admin/secret');
      expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBeNull();
    });

    it('should reject absolute URLs', () => {
      service.setRedirectUrl('https://evil.com/dashboard');
      expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBeNull();
    });

    it('should default to /dashboard when no redirect URL stored', () => {
      expect(service.consumeRedirectUrl()).toBe('/dashboard');
    });

    it('should consume and clear redirect URL', () => {
      sessionStorage.setItem(REDIRECT_URL_KEY, '/users');
      expect(service.consumeRedirectUrl()).toBe('/users');
      expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBeNull();
    });
  });

  describe('setRefreshing()', () => {
    it('should update isRefreshing signal', () => {
      expect(service.isRefreshing()).toBe(false);
      service.setRefreshing(true);
      expect(service.isRefreshing()).toBe(true);
      service.setRefreshing(false);
      expect(service.isRefreshing()).toBe(false);
    });
  });
});
