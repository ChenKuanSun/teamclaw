import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AdminAuthService } from './admin-auth.service';
import { environment } from '../../environments/environment';

// Polyfill crypto.subtle for jsdom test environment
if (typeof globalThis.crypto?.subtle === 'undefined') {
  const { webcrypto } = require('crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}

describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let router: jest.Mocked<Router>;
  let httpMock: HttpTestingController;

  const TOKEN_STORAGE_KEY = 'admin_auth_result';
  const REDIRECT_URL_KEY = 'admin_redirect_url';
  const PKCE_VERIFIER_KEY = 'admin_pkce_verifier';
  const OAUTH_STATE_KEY = 'admin_oauth_state';

  const mockIdToken =
    'eyJhbGciOiJIUzI1NiJ9.' +
    btoa(JSON.stringify({ email: 'admin@test.com' })) +
    '.sig';

  const mockTokenResponse = {
    access_token: 'mock-access-token',
    id_token: mockIdToken,
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    token_type: 'Bearer',
  };

  function createService() {
    TestBed.configureTestingModule({
      providers: [
        AdminAuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    });
    service = TestBed.inject(AdminAuthService);
    httpMock = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    sessionStorage.clear();
    jest.clearAllMocks();

    router = {
      navigateByUrl: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<Router>;

    createService();
  });

  afterEach(() => {
    httpMock.verify();
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
    it('should store PKCE verifier and state in sessionStorage and redirect', async () => {
      // In jsdom, window.location.href assignment navigates to about:blank
      // but doesn't throw. We verify PKCE state is stored.
      const originalHref = window.location.href;

      await service.login();

      // Verify PKCE verifier and state are stored
      expect(sessionStorage.getItem(PKCE_VERIFIER_KEY)).toBeTruthy();
      expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBeTruthy();

      // Verifier should be a hex string of sufficient length
      const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY)!;
      expect(verifier.length).toBeGreaterThanOrEqual(64);

      // State should be a hex string
      const state = sessionStorage.getItem(OAUTH_STATE_KEY)!;
      expect(state.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('handleCallback()', () => {
    it('should exchange code for tokens and store them', async () => {
      const storedState = 'test-state-value';
      sessionStorage.setItem(OAUTH_STATE_KEY, storedState);
      sessionStorage.setItem(PKCE_VERIFIER_KEY, 'test-verifier');

      const callbackPromise = service.handleCallback('auth-code-123', storedState);

      const tokenUrl = `https://${environment.auth.domain}/oauth2/token`;
      const req = httpMock.expectOne(tokenUrl);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
      expect(req.request.body).toContain('grant_type=authorization_code');
      expect(req.request.body).toContain('code=auth-code-123');
      expect(req.request.body).toContain('code_verifier=test-verifier');

      req.flush(mockTokenResponse);

      const success = await callbackPromise;

      expect(success).toBe(true);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.accessToken()).toBe('mock-access-token');
      expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeTruthy();
      // PKCE values should be cleared
      expect(sessionStorage.getItem(PKCE_VERIFIER_KEY)).toBeNull();
      expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBeNull();
    });

    it('should reject on state mismatch (CSRF protection)', async () => {
      sessionStorage.setItem(OAUTH_STATE_KEY, 'correct-state');
      sessionStorage.setItem(PKCE_VERIFIER_KEY, 'test-verifier');

      const result = await service.handleCallback('code', 'wrong-state');

      expect(result).toBe(false);
      expect(service.isAuthenticated()).toBe(false);
    });

    it('should reject when PKCE verifier is missing', async () => {
      sessionStorage.setItem(OAUTH_STATE_KEY, 'test-state');
      // No PKCE verifier

      const result = await service.handleCallback('code', 'test-state');

      expect(result).toBe(false);
      expect(service.isAuthenticated()).toBe(false);
    });

    it('should handle token exchange failure', async () => {
      const storedState = 'test-state';
      sessionStorage.setItem(OAUTH_STATE_KEY, storedState);
      sessionStorage.setItem(PKCE_VERIFIER_KEY, 'test-verifier');

      const callbackPromise = service.handleCallback('bad-code', storedState);

      const tokenUrl = `https://${environment.auth.domain}/oauth2/token`;
      const req = httpMock.expectOne(tokenUrl);
      req.flush('Invalid grant', { status: 400, statusText: 'Bad Request' });

      const result = await callbackPromise;

      expect(result).toBe(false);
      expect(service.isAuthenticated()).toBe(false);
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('refreshAccessToken()', () => {
    it('should return false when no refresh token', async () => {
      const result = await service.refreshAccessToken();
      expect(result).toBe(false);
    });

    it('should refresh token via OAuth token endpoint', async () => {
      // Set up initial state with refresh token
      const stored = {
        accessToken: 'old-access',
        idToken: 'old-id',
        refreshToken: 'valid-refresh-token',
        expiresAt: Date.now() - 100_000, // expired
      };
      sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(stored));
      TestBed.resetTestingModule();
      createService();

      const refreshPromise = service.refreshAccessToken();

      const tokenUrl = `https://${environment.auth.domain}/oauth2/token`;
      const req = httpMock.expectOne(tokenUrl);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toContain('grant_type=refresh_token');
      expect(req.request.body).toContain('refresh_token=valid-refresh-token');

      req.flush(mockTokenResponse);

      const result = await refreshPromise;

      expect(result).toBe(true);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.accessToken()).toBe('mock-access-token');
    });

    it('should sign out when refresh fails', async () => {
      const stored = {
        accessToken: 'old',
        idToken: 'old',
        refreshToken: 'bad-refresh',
        expiresAt: Date.now() - 100_000,
      };
      sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(stored));
      TestBed.resetTestingModule();
      createService();

      const refreshPromise = service.refreshAccessToken();

      const tokenUrl = `https://${environment.auth.domain}/oauth2/token`;
      const req = httpMock.expectOne(tokenUrl);
      req.flush('Invalid refresh token', { status: 400, statusText: 'Bad Request' });

      const result = await refreshPromise;

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
      const storedState = 'test-state';
      sessionStorage.setItem(OAUTH_STATE_KEY, storedState);
      sessionStorage.setItem(PKCE_VERIFIER_KEY, 'test-verifier');

      const callbackPromise = service.handleCallback('code', storedState);

      const tokenUrl = `https://${environment.auth.domain}/oauth2/token`;
      const req = httpMock.expectOne(tokenUrl);
      req.flush(mockTokenResponse);
      await callbackPromise;

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
