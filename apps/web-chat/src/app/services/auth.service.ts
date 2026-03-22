import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private userPool: CognitoUserPool;

  // Signal-based state (matching Affiora pattern)
  private readonly _user = signal<CognitoUser | null>(null);
  private readonly _session = signal<CognitoUserSession | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _errorMessage = signal('');

  readonly isAuthenticated = computed(() => {
    const session = this._session();
    return session !== null && session.isValid();
  });
  readonly isLoading = this._isLoading.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();
  readonly user = this._user.asReadonly();

  constructor() {
    this.userPool = new CognitoUserPool({
      UserPoolId: environment.cognito.userPoolId,
      ClientId: environment.cognito.clientId,
    });

    this.restoreSession();
  }

  /**
   * Restore session from existing Cognito user on construction
   */
  private restoreSession(): void {
    const currentUser = this.userPool.getCurrentUser();
    if (currentUser) {
      currentUser.getSession(
        (err: Error | null, session: CognitoUserSession) => {
          if (!err && session && session.isValid()) {
            this._user.set(currentUser);
            this._session.set(session);
          }
        },
      );
    }
  }

  /**
   * Sign in with email and password
   */
  async login(email: string, password: string): Promise<CognitoUserSession> {
    this._isLoading.set(true);
    this._errorMessage.set('');

    const user = new CognitoUser({ Username: email, Pool: this.userPool });
    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    return new Promise((resolve, reject) => {
      user.authenticateUser(authDetails, {
        onSuccess: session => {
          this._user.set(user);
          this._session.set(session);
          this._isLoading.set(false);
          resolve(session);
        },
        onFailure: err => {
          this._isLoading.set(false);
          this._errorMessage.set(err.message || 'Authentication failed');
          reject(err);
        },
      });
    });
  }

  /**
   * Sign out and redirect to login
   */
  signOut(): void {
    this.userPool.getCurrentUser()?.signOut();
    this._user.set(null);
    this._session.set(null);
    this.router.navigate(['/login']);
  }

  /**
   * Redirect to login page
   */
  redirectToLogin(): void {
    this.router.navigate(['/login']);
  }

  /**
   * Get current ID token for API/WebSocket authentication
   */
  getIdToken(): string | null {
    return this._session()?.getIdToken()?.getJwtToken() || null;
  }

  async signUp(email: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.userPool.signUp(
        email,
        password,
        [new CognitoUserAttribute({ Name: 'email', Value: email })],
        [],
        err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        },
      );
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = new CognitoUser({ Username: email, Pool: this.userPool });
    return new Promise((resolve, reject) => {
      user.forgotPassword({
        onSuccess: () => resolve(),
        onFailure: err => reject(err),
      });
    });
  }

  async confirmNewPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const user = new CognitoUser({ Username: email, Pool: this.userPool });
    return new Promise((resolve, reject) => {
      user.confirmPassword(code, newPassword, {
        onSuccess: () => resolve(),
        onFailure: err => reject(err),
      });
    });
  }

  async confirmRegistration(email: string, code: string): Promise<void> {
    const user = new CognitoUser({ Username: email, Pool: this.userPool });
    return new Promise((resolve, reject) => {
      user.confirmRegistration(code, true, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
