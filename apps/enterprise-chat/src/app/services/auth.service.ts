import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private userPool: CognitoUserPool;
  readonly user$ = new BehaviorSubject<CognitoUser | null>(null);
  readonly session$ = new BehaviorSubject<CognitoUserSession | null>(null);

  constructor() {
    this.userPool = new CognitoUserPool({
      UserPoolId: environment.cognito.userPoolId,
      ClientId: environment.cognito.clientId,
    });

    const currentUser = this.userPool.getCurrentUser();
    if (currentUser) {
      currentUser.getSession((err: Error | null, session: CognitoUserSession) => {
        if (!err && session.isValid()) {
          this.user$.next(currentUser);
          this.session$.next(session);
        }
      });
    }
  }

  login(email: string, password: string): Promise<CognitoUserSession> {
    const user = new CognitoUser({ Username: email, Pool: this.userPool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });

    return new Promise((resolve, reject) => {
      user.authenticateUser(authDetails, {
        onSuccess: (session) => {
          this.user$.next(user);
          this.session$.next(session);
          resolve(session);
        },
        onFailure: reject,
      });
    });
  }

  logout(): void {
    this.userPool.getCurrentUser()?.signOut();
    this.user$.next(null);
    this.session$.next(null);
  }

  getIdToken(): string | null {
    return this.session$.value?.getIdToken()?.getJwtToken() || null;
  }
}
