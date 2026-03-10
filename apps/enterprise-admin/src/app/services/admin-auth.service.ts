import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { environment } from '../../environments/environment';

interface AuthState {
  isLoading: boolean;
  isRefreshing: boolean;
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  error: string;
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
  error: '',
};

const REDIRECT_URL_KEY = 'admin_redirect_url';
const ALLOWED_REDIRECT_PATHS = ['/dashboard', '/users', '/teams', '/containers', '/config', '/api-keys', '/analytics'];
const TOKEN_STORAGE_KEY = 'admin_auth_result';
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

@Injectable({
  providedIn: 'root',
})
export class AdminAuthService {
  private readonly router = inject(Router);

  private readonly userPool = new CognitoUserPool({
    UserPoolId: environment.auth.userPoolId,
    ClientId: environment.auth.clientId,
  });

  private readonly state = signal<AuthState>({
    ...INITIAL_STATE,
    ...this.loadFromStorage(),
  });

  readonly isLoading = computed(() => this.state().isLoading);
  readonly isRefreshing = computed(() => this.state().isRefreshing);
  readonly error = computed(() => this.state().error);
  readonly isAuthenticated = computed(() => {
    const { accessToken, expiresAt } = this.state();
    if (!accessToken) return false;
    return Date.now() < expiresAt - TOKEN_EXPIRY_BUFFER_MS;
  });
  readonly accessToken = computed(() => this.state().accessToken);
  readonly idToken = computed(() => this.state().idToken);
  readonly hasRefreshToken = computed(() => !!this.state().refreshToken);

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

  setRefreshing(value: boolean): void {
    this.state.update((s) => ({ ...s, isRefreshing: value }));
  }

  setRedirectUrl(url: string): void {
    if (!url.startsWith('/')) return;
    const isAllowed = ALLOWED_REDIRECT_PATHS.some((path) => url.startsWith(path));
    if (!isAllowed) return;
    sessionStorage.setItem(REDIRECT_URL_KEY, url);
  }

  consumeRedirectUrl(): string {
    const url = sessionStorage.getItem(REDIRECT_URL_KEY);
    sessionStorage.removeItem(REDIRECT_URL_KEY);
    if (!url || !url.startsWith('/')) return '/dashboard';
    const isAllowed = ALLOWED_REDIRECT_PATHS.some((path) => url.startsWith(path));
    return isAllowed ? url : '/dashboard';
  }

  /**
   * Authenticate with username (email) and password via Cognito SRP.
   */
  async login(email: string, password: string): Promise<boolean> {
    this.state.update((s) => ({ ...s, isLoading: true, error: '' }));

    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: this.userPool,
    });

    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    return new Promise<boolean>((resolve) => {
      cognitoUser.authenticateUser(authDetails, {
        onSuccess: async (session: CognitoUserSession) => {
          this.handleSession(session);
          const redirectUrl = this.consumeRedirectUrl();
          await this.router.navigateByUrl(redirectUrl);
          resolve(true);
        },
        onFailure: (err: Error) => {
          console.error('[AdminAuthService] Login failed:', err);
          this.state.update((s) => ({
            ...s,
            isLoading: false,
            error: this.mapCognitoError(err),
          }));
          resolve(false);
        },
        newPasswordRequired: () => {
          // Admin accounts created by Cognito require password change on first login.
          // For now, surface the error — a "change password" flow can be added later.
          this.state.update((s) => ({
            ...s,
            isLoading: false,
            error: 'Password change required. Contact your administrator.',
          }));
          resolve(false);
        },
      });
    });
  }

  /**
   * Refresh access token using the stored refresh token.
   */
  async refreshAccessToken(): Promise<boolean> {
    const currentUser = this.userPool.getCurrentUser();
    if (!currentUser) return false;

    return new Promise<boolean>((resolve) => {
      currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session || !session.isValid()) {
          console.error('[AdminAuthService] Token refresh failed:', err);
          this.signOut();
          resolve(false);
          return;
        }
        this.handleSession(session);
        resolve(true);
      });
    });
  }

  signOut() {
    const currentUser = this.userPool.getCurrentUser();
    if (currentUser) {
      currentUser.signOut();
    }
    this.state.set(INITIAL_STATE);
    this.clearStorage();
    this.router.navigateByUrl('/auth/login');
  }

  private handleSession(session: CognitoUserSession): void {
    const expiresAt = session.getAccessToken().getExpiration() * 1000;
    const tokens: StoredAuth = {
      accessToken: session.getAccessToken().getJwtToken(),
      idToken: session.getIdToken().getJwtToken(),
      refreshToken: session.getRefreshToken().getToken(),
      expiresAt,
    };

    this.state.update((s) => ({
      ...s,
      ...tokens,
      isLoading: false,
      error: '',
    }));
    this.saveToStorage(tokens);
  }

  private mapCognitoError(err: Error & { code?: string }): string {
    switch (err.code || err.name) {
      case 'NotAuthorizedException':
        return 'Invalid email or password.';
      case 'UserNotFoundException':
        return 'Invalid email or password.';
      case 'UserNotConfirmedException':
        return 'Account not confirmed. Contact your administrator.';
      case 'PasswordResetRequiredException':
        return 'Password reset required. Contact your administrator.';
      default:
        return err.message || 'Authentication failed.';
    }
  }

  private loadFromStorage(): Partial<AuthState> {
    try {
      const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
      if (stored) {
        const parsed: StoredAuth = JSON.parse(stored);
        if (parsed.refreshToken) {
          const isValid = parsed.expiresAt && Date.now() < parsed.expiresAt - TOKEN_EXPIRY_BUFFER_MS;
          return {
            accessToken: isValid ? parsed.accessToken || '' : '',
            idToken: isValid ? parsed.idToken || '' : '',
            refreshToken: parsed.refreshToken,
            expiresAt: isValid ? parsed.expiresAt || 0 : 0,
          };
        }
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
    sessionStorage.removeItem(REDIRECT_URL_KEY);
  }
}
