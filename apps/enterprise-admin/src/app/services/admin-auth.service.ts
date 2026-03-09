import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

interface AuthState {
  isLoading: boolean;
  isRefreshing: boolean;
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface StoredAuth {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

const INITIAL_STATE: AuthState = {
  isLoading: false,
  isRefreshing: false,
  accessToken: '',
  idToken: '',
  refreshToken: '',
  expiresAt: 0,
};

const REDIRECT_URL_KEY = 'admin_redirect_url';
const ALLOWED_REDIRECT_PATHS = ['/dashboard', '/users', '/teams', '/containers', '/config', '/api-keys', '/analytics'];

const TOKEN_STORAGE_KEY = 'admin_auth_result';
const PKCE_VERIFIER_KEY = 'admin_pkce_verifier';
const OAUTH_STATE_KEY = 'admin_oauth_state';
const TOKEN_EXPIRY_BUFFER_MS = 60_000; // 1 minute buffer before expiry

// Cognito token endpoint response
interface TokenResponse {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

/**
 * Generate cryptographically secure random string for PKCE and state
 */
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate PKCE code challenge from verifier using SHA-256
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  // Base64URL encode
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

@Injectable({
  providedIn: 'root',
})
export class AdminAuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  // State
  private readonly state = signal<AuthState>({
    ...INITIAL_STATE,
    ...this.loadFromStorage(),
  });

  readonly isLoading = computed(() => this.state().isLoading);
  readonly isRefreshing = computed(() => this.state().isRefreshing);
  readonly isAuthenticated = computed(() => {
    const { accessToken, expiresAt } = this.state();
    if (!accessToken) return false;
    // Check if token is expired (with buffer)
    return Date.now() < expiresAt - TOKEN_EXPIRY_BUFFER_MS;
  });
  readonly accessToken = computed(() => this.state().accessToken);
  readonly idToken = computed(() => this.state().idToken);
  readonly hasRefreshToken = computed(() => !!this.state().refreshToken);

  /**
   * Set refreshing state - used by interceptor to prevent concurrent refresh attempts
   */
  setRefreshing(value: boolean): void {
    this.state.update((s) => ({ ...s, isRefreshing: value }));
  }

  /**
   * Store redirect URL with validation (same-origin, allowed paths only)
   */
  setRedirectUrl(url: string): void {
    // Validate URL is a relative path and starts with allowed prefix
    if (!url.startsWith('/')) return;

    // Check if path starts with any allowed prefix
    const isAllowed = ALLOWED_REDIRECT_PATHS.some((path) => url.startsWith(path));
    if (!isAllowed) return;

    // Use sessionStorage for consistency with auth tokens
    sessionStorage.setItem(REDIRECT_URL_KEY, url);
  }

  /**
   * Get and clear stored redirect URL
   */
  consumeRedirectUrl(): string {
    const url = sessionStorage.getItem(REDIRECT_URL_KEY);
    sessionStorage.removeItem(REDIRECT_URL_KEY);

    // Validate again on consume
    if (!url || !url.startsWith('/')) return '/dashboard';

    const isAllowed = ALLOWED_REDIRECT_PATHS.some((path) => url.startsWith(path));
    return isAllowed ? url : '/dashboard';
  }

  readonly userEmail = computed(() => {
    const idToken = this.idToken();
    if (!idToken) return '';

    try {
      const payload = idToken.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      return decoded.email || '';
    } catch {
      return '';
    }
  });

  private loadFromStorage(): Partial<AuthState> {
    try {
      // Use sessionStorage for better security (cleared on tab close)
      const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
      if (stored) {
        const parsed: StoredAuth = JSON.parse(stored);

        // Always return refresh token if available - interceptor will handle token refresh
        // Only clear storage if no refresh token exists
        if (parsed.refreshToken) {
          const isAccessTokenValid =
            parsed.expiresAt && Date.now() < parsed.expiresAt - TOKEN_EXPIRY_BUFFER_MS;

          return {
            // Only return access/id tokens if not expired
            accessToken: isAccessTokenValid ? parsed.accessToken || '' : '',
            idToken: isAccessTokenValid ? parsed.idToken || '' : '',
            // Always preserve refresh token for token refresh flow
            refreshToken: parsed.refreshToken,
            expiresAt: isAccessTokenValid ? parsed.expiresAt || 0 : 0,
          };
        }

        // No refresh token, clear storage
        this.clearStorage();
      }
    } catch {
      // Ignore parse errors
    }
    return {};
  }

  private saveToStorage(tokens: StoredAuth): void {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  }

  private clearStorage(): void {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(PKCE_VERIFIER_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    sessionStorage.removeItem(REDIRECT_URL_KEY);
  }

  private getRedirectUri(): string {
    return `${window.location.origin}/auth/callback`;
  }

  /**
   * Redirect to Cognito OAuth login with PKCE and state for security
   */
  async login(): Promise<void> {
    const { clientId, domain } = environment.auth;
    const redirectUri = this.getRedirectUri();
    const scopes = 'openid email profile';

    // Generate PKCE code verifier and challenge
    const codeVerifier = generateRandomString(64);
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Generate state for CSRF protection
    const state = generateRandomString(32);

    // Store verifier and state in sessionStorage for callback validation
    sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
    sessionStorage.setItem(OAUTH_STATE_KEY, state);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    window.location.href = `https://${domain}/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Handle OAuth callback - validate state and exchange code for tokens with PKCE
   */
  async handleCallback(code: string, returnedState: string): Promise<boolean> {
    this.state.update((s) => ({ ...s, isLoading: true }));

    try {
      // Validate state parameter to prevent CSRF attacks
      const storedState = sessionStorage.getItem(OAUTH_STATE_KEY);
      if (!storedState || storedState !== returnedState) {
        console.error('[AdminAuthService] State mismatch - possible CSRF attack');
        this.clearStorage();
        this.state.update((s) => ({ ...s, isLoading: false }));
        return false;
      }

      // Get PKCE code verifier
      const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
      if (!codeVerifier) {
        console.error('[AdminAuthService] Missing PKCE code verifier');
        this.clearStorage();
        this.state.update((s) => ({ ...s, isLoading: false }));
        return false;
      }

      const { clientId, domain } = environment.auth;
      const redirectUri = this.getRedirectUri();

      // Exchange authorization code for tokens with PKCE verifier
      const tokenUrl = `https://${domain}/oauth2/token`;
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      });

      const response = await firstValueFrom(
        this.http.post<TokenResponse>(tokenUrl, body.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      // Clear PKCE and state after successful exchange
      sessionStorage.removeItem(PKCE_VERIFIER_KEY);
      sessionStorage.removeItem(OAUTH_STATE_KEY);

      const expiresAt = Date.now() + response.expires_in * 1000;
      const tokens: StoredAuth = {
        accessToken: response.access_token,
        idToken: response.id_token,
        refreshToken: response.refresh_token || '',
        expiresAt,
      };

      this.state.update((s) => ({
        ...s,
        ...tokens,
        isLoading: false,
      }));

      this.saveToStorage(tokens);

      // Navigate to stored redirect URL or dashboard
      const redirectUrl = this.consumeRedirectUrl();
      await this.router.navigateByUrl(redirectUrl);
      return true;
    } catch (error) {
      console.error('[AdminAuthService] Token exchange failed:', error);
      this.clearStorage();
      this.state.update((s) => ({ ...s, isLoading: false }));
      return false;
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<boolean> {
    const refreshToken = this.state().refreshToken;
    if (!refreshToken) {
      return false;
    }

    try {
      const { clientId, domain } = environment.auth;
      const tokenUrl = `https://${domain}/oauth2/token`;
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
      });

      const response = await firstValueFrom(
        this.http.post<TokenResponse>(tokenUrl, body.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      const expiresAt = Date.now() + response.expires_in * 1000;
      const tokens: StoredAuth = {
        accessToken: response.access_token,
        idToken: response.id_token,
        refreshToken: response.refresh_token || refreshToken,
        expiresAt,
      };

      this.state.update((s) => ({
        ...s,
        ...tokens,
      }));

      this.saveToStorage(tokens);
      return true;
    } catch (error) {
      console.error('[AdminAuthService] Token refresh failed:', error);
      this.signOut();
      return false;
    }
  }

  /**
   * Sign out and clear tokens
   */
  signOut() {
    this.state.set(INITIAL_STATE);
    this.clearStorage();
    this.router.navigateByUrl('/auth/login');
  }
}
