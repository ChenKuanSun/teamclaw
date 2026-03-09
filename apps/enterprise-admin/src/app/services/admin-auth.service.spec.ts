import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AdminAuthService } from './admin-auth.service';
import { environment } from '../../environments/environment';

describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let httpMock: HttpTestingController;
  let router: jest.Mocked<Router>;

  const TOKEN_STORAGE_KEY = 'admin_auth_result';
  const PKCE_VERIFIER_KEY = 'admin_pkce_verifier';
  const OAUTH_STATE_KEY = 'admin_oauth_state';
  const REDIRECT_URL_KEY = 'admin_redirect_url';

  const mockTokenResponse = {
    access_token: 'mock-access-token',
    id_token:
      'eyJhbGciOiJIUzI1NiJ9.' +
      btoa(JSON.stringify({ email: 'admin@test.com' })) +
      '.sig',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    token_type: 'Bearer',
  };

  function createService() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AdminAuthService,
        { provide: Router, useValue: router },
      ],
    });

    service = TestBed.inject(AdminAuthService);
    httpMock = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    sessionStorage.clear();

    router = {
      navigateByUrl: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<Router>;

    createService();
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
    // Reset URL
    window.history.pushState({}, '', '/');
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

    it('should clear storage if no refresh token and tokens are present', () => {
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

    it('should handle corrupted JSON in sessionStorage gracefully', () => {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, 'not-valid-json{{{');

      TestBed.resetTestingModule();
      createService();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.accessToken()).toBe('');
    });
  });

  describe('login()', () => {
    it('should store PKCE verifier and state in sessionStorage', async () => {
      // Mock crypto.subtle.digest since it may not be available in jsdom
      const originalDigest = crypto.subtle?.digest;
      if (crypto.subtle) {
        crypto.subtle.digest = jest.fn().mockResolvedValue(new ArrayBuffer(32));
      } else {
        Object.defineProperty(crypto, 'subtle', {
          value: { digest: jest.fn().mockResolvedValue(new ArrayBuffer(32)) },
          configurable: true,
        });
      }

      try {
        await service.login();
      } catch {
        // Expected: jsdom may throw on window.location.href navigation
      }

      expect(sessionStorage.getItem(PKCE_VERIFIER_KEY)).toBeTruthy();
      expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBeTruthy();

      // Restore
      if (originalDigest && crypto.subtle) {
        crypto.subtle.digest = originalDigest;
      }
    });
  });

  describe('handleCallback()', () => {
    const tokenUrl = `https://${environment.auth.domain}/oauth2/token`;

    it('should exchange auth code for tokens and navigate to dashboard', async () => {
      const storedState = 'test-state-value';
      sessionStorage.setItem(OAUTH_STATE_KEY, storedState);
      sessionStorage.setItem(PKCE_VERIFIER_KEY, 'test-verifier');

      const callbackPromise = service.handleCallback('auth-code-123', storedState);

      const req = httpMock.expectOne((r) => r.url === tokenUrl);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Content-Type')).toBe(
        'application/x-www-form-urlencoded',
      );
      expect(req.request.body).toContain('grant_type=authorization_code');
      expect(req.request.body).toContain('code=auth-code-123');
      expect(req.request.body).toContain('code_verifier=test-verifier');
      req.flush(mockTokenResponse);

      const result = await callbackPromise;

      expect(result).toBe(true);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.accessToken()).toBe('mock-access-token');
      expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');

      // PKCE artifacts should be cleaned up
      expect(sessionStorage.getItem(PKCE_VERIFIER_KEY)).toBeNull();
      expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBeNull();
    });

    it('should navigate to stored redirect URL after login', async () => {
      const storedState = 'test-state';
      sessionStorage.setItem(OAUTH_STATE_KEY, storedState);
      sessionStorage.setItem(PKCE_VERIFIER_KEY, 'verifier');
      sessionStorage.setItem(REDIRECT_URL_KEY, '/users');

      const callbackPromise = service.handleCallback('code', storedState);
      httpMock.expectOne(tokenUrl).flush(mockTokenResponse);

      await callbackPromise;

      expect(router.navigateByUrl).toHaveBeenCalledWith('/users');
      expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBeNull();
    });

    it('should reject callback with state mismatch (CSRF protection)', async () => {
      sessionStorage.setItem(OAUTH_STATE_KEY, 'correct-state');
      sessionStorage.setItem(PKCE_VERIFIER_KEY, 'verifier');

      const result = await service.handleCallback('code', 'wrong-state');

      expect(result).toBe(false);
      expect(service.isAuthenticated()).toBe(false);
      httpMock.expectNone(tokenUrl);
    });

    it('should reject callback with missing PKCE verifier', async () => {
      const storedState = 'test-state';
      sessionStorage.setItem(OAUTH_STATE_KEY, storedState);

      const result = await service.handleCallback('code', storedState);

      expect(result).toBe(false);
      httpMock.expectNone(tokenUrl);
    });

    it('should handle token exchange HTTP failure', async () => {
      const storedState = 'test-state';
      sessionStorage.setItem(OAUTH_STATE_KEY, storedState);
      sessionStorage.setItem(PKCE_VERIFIER_KEY, 'verifier');

      const callbackPromise = service.handleCallback('code', storedState);
      httpMock.expectOne(tokenUrl).flush('error', { status: 400, statusText: 'Bad Request' });

      const result = await callbackPromise;

      expect(result).toBe(false);
      expect(service.isAuthenticated()).toBe(false);
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('refreshAccessToken()', () => {
    const tokenUrl = `https://${environment.auth.domain}/oauth2/token`;

    it('should return false when no refresh token exists', async () => {
      const result = await service.refreshAccessToken();
      expect(result).toBe(false);
      httpMock.expectNone(tokenUrl);
    });

    it('should refresh token and update state', async () => {
      const stored = {
        accessToken: '',
        idToken: '',
        refreshToken: 'my-refresh-token',
        expiresAt: 0,
      };
      sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(stored));

      TestBed.resetTestingModule();
      createService();

      const refreshPromise = service.refreshAccessToken();

      const req = httpMock.expectOne((r) => r.url === tokenUrl);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toContain('grant_type=refresh_token');
      expect(req.request.body).toContain('refresh_token=my-refresh-token');
      req.flush(mockTokenResponse);

      const result = await refreshPromise;

      expect(result).toBe(true);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.accessToken()).toBe('mock-access-token');
    });

    it('should sign out when refresh fails', async () => {
      const stored = {
        accessToken: '',
        idToken: '',
        refreshToken: 'my-refresh-token',
        expiresAt: 0,
      };
      sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(stored));

      TestBed.resetTestingModule();
      createService();

      const refreshPromise = service.refreshAccessToken();
      httpMock
        .expectOne((r) => r.url === tokenUrl)
        .flush('error', { status: 400, statusText: 'Bad Request' });

      const result = await refreshPromise;

      expect(result).toBe(false);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/login');
    });
  });

  describe('signOut()', () => {
    it('should clear state and storage and navigate to login', () => {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, 'data');
      sessionStorage.setItem(PKCE_VERIFIER_KEY, 'verifier');
      sessionStorage.setItem(OAUTH_STATE_KEY, 'state');

      service.signOut();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.accessToken()).toBe('');
      expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
      expect(sessionStorage.getItem(PKCE_VERIFIER_KEY)).toBeNull();
      expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBeNull();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/login');
    });
  });

  describe('userEmail', () => {
    it('should decode email from id token', async () => {
      sessionStorage.setItem(OAUTH_STATE_KEY, 'state');
      sessionStorage.setItem(PKCE_VERIFIER_KEY, 'verifier');

      const callbackPromise = service.handleCallback('code', 'state');
      const tokenUrl = `https://${environment.auth.domain}/oauth2/token`;
      httpMock.expectOne(tokenUrl).flush(mockTokenResponse);
      await callbackPromise;

      expect(service.userEmail()).toBe('admin@test.com');
    });

    it('should return empty string for missing id token', () => {
      expect(service.userEmail()).toBe('');
    });

    it('should return empty string for corrupted id token', async () => {
      sessionStorage.setItem(OAUTH_STATE_KEY, 'state');
      sessionStorage.setItem(PKCE_VERIFIER_KEY, 'verifier');

      const callbackPromise = service.handleCallback('code', 'state');
      const tokenUrl = `https://${environment.auth.domain}/oauth2/token`;
      httpMock.expectOne(tokenUrl).flush({
        ...mockTokenResponse,
        id_token: 'not.valid-base64.token',
      });
      await callbackPromise;

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

      service.setRedirectUrl('/containers');
      expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBe('/containers');

      service.setRedirectUrl('/config');
      expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBe('/config');

      service.setRedirectUrl('/api-keys');
      expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBe('/api-keys');

      service.setRedirectUrl('/analytics');
      expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBe('/analytics');
    });

    it('should reject non-allowed paths', () => {
      service.setRedirectUrl('/admin/secret');
      expect(sessionStorage.getItem(REDIRECT_URL_KEY)).toBeNull();
    });

    it('should reject absolute URLs (non-relative)', () => {
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

    it('should default to /dashboard for invalid consumed URL', () => {
      sessionStorage.setItem(REDIRECT_URL_KEY, '/admin/secret');
      expect(service.consumeRedirectUrl()).toBe('/dashboard');
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
