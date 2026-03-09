import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import {
  CognitoUserPool,
  CognitoUser,
  CognitoUserSession,
  CognitoIdToken,
} from 'amazon-cognito-identity-js';

jest.mock('amazon-cognito-identity-js');

const MockCognitoUserPool = CognitoUserPool as jest.MockedClass<typeof CognitoUserPool>;
const MockCognitoUser = CognitoUser as jest.MockedClass<typeof CognitoUser>;

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockCognitoUserPool.prototype.getCurrentUser = jest.fn().mockReturnValue(null);
  });

  function createService(): AuthService {
    TestBed.configureTestingModule({});
    return TestBed.inject(AuthService);
  }

  describe('initialization', () => {
    it('should create', () => {
      const service = createService();
      expect(service).toBeTruthy();
    });

    it('should initialize user$ and session$ as null when no current user', () => {
      const service = createService();
      expect(service.user$.value).toBeNull();
      expect(service.session$.value).toBeNull();
    });

    it('should restore session from existing user on construction', () => {
      const mockSession = {
        isValid: jest.fn().mockReturnValue(true),
      } as unknown as CognitoUserSession;

      const mockUser = {
        getSession: jest.fn((cb: (err: Error | null, session: CognitoUserSession) => void) => {
          cb(null, mockSession);
        }),
      } as unknown as CognitoUser;

      MockCognitoUserPool.prototype.getCurrentUser = jest.fn().mockReturnValue(mockUser);

      const service = createService();

      expect(service.user$.value).toBe(mockUser);
      expect(service.session$.value).toBe(mockSession);
    });

    it('should not restore session if session is invalid', () => {
      const mockSession = {
        isValid: jest.fn().mockReturnValue(false),
      } as unknown as CognitoUserSession;

      const mockUser = {
        getSession: jest.fn((cb: (err: Error | null, session: CognitoUserSession) => void) => {
          cb(null, mockSession);
        }),
      } as unknown as CognitoUser;

      MockCognitoUserPool.prototype.getCurrentUser = jest.fn().mockReturnValue(mockUser);

      const service = createService();

      expect(service.user$.value).toBeNull();
      expect(service.session$.value).toBeNull();
    });

    it('should not restore session if getSession returns error', () => {
      const mockUser = {
        getSession: jest.fn((cb: (err: Error | null, session: CognitoUserSession) => void) => {
          cb(new Error('Session expired'), null as unknown as CognitoUserSession);
        }),
      } as unknown as CognitoUser;

      MockCognitoUserPool.prototype.getCurrentUser = jest.fn().mockReturnValue(mockUser);

      const service = createService();

      expect(service.user$.value).toBeNull();
      expect(service.session$.value).toBeNull();
    });
  });

  describe('login', () => {
    it('should authenticate user and update subjects on success', async () => {
      const mockSession = {} as CognitoUserSession;
      MockCognitoUser.prototype.authenticateUser = jest.fn((_authDetails, callbacks) => {
        callbacks.onSuccess(mockSession);
      });

      const service = createService();
      const result = await service.login('test@example.com', 'password123');

      expect(result).toBe(mockSession);
      expect(service.user$.value).toBeTruthy();
      expect(service.session$.value).toBe(mockSession);
    });

    it('should reject on authentication failure', async () => {
      const error = new Error('Incorrect username or password');
      MockCognitoUser.prototype.authenticateUser = jest.fn((_authDetails, callbacks) => {
        callbacks.onFailure(error);
      });

      const service = createService();

      await expect(service.login('test@example.com', 'wrong')).rejects.toThrow(
        'Incorrect username or password'
      );
      expect(service.user$.value).toBeNull();
      expect(service.session$.value).toBeNull();
    });
  });

  describe('logout', () => {
    it('should sign out current user and clear subjects', () => {
      const mockSignOut = jest.fn();
      const mockCurrentUser = { signOut: mockSignOut } as unknown as CognitoUser;

      // During construction, getCurrentUser returns null (default in beforeEach)
      const service = createService();

      // Simulate a logged-in state
      service.user$.next(mockCurrentUser);
      service.session$.next({} as CognitoUserSession);

      // Now make getCurrentUser return the mock user for the logout() call
      // Access the actual pool instance via the mocked constructor calls
      const poolInstance = MockCognitoUserPool.mock.instances[MockCognitoUserPool.mock.instances.length - 1];
      (poolInstance.getCurrentUser as jest.Mock).mockReturnValue(mockCurrentUser);

      service.logout();

      expect(mockSignOut).toHaveBeenCalled();
      expect(service.user$.value).toBeNull();
      expect(service.session$.value).toBeNull();
    });

    it('should handle logout when no current user exists', () => {
      const service = createService();
      // getCurrentUser returns null on the logout call
      MockCognitoUserPool.prototype.getCurrentUser = jest.fn().mockReturnValue(null);

      expect(() => service.logout()).not.toThrow();
      expect(service.user$.value).toBeNull();
      expect(service.session$.value).toBeNull();
    });
  });

  describe('getIdToken', () => {
    it('should return JWT token when session exists', () => {
      const mockIdToken = {
        getJwtToken: jest.fn().mockReturnValue('mock-jwt-token'),
      } as unknown as CognitoIdToken;
      const mockSession = {
        isValid: jest.fn().mockReturnValue(true),
        getIdToken: jest.fn().mockReturnValue(mockIdToken),
      } as unknown as CognitoUserSession;

      const service = createService();
      service.session$.next(mockSession);

      expect(service.getIdToken()).toBe('mock-jwt-token');
    });

    it('should return null when no session exists', () => {
      const service = createService();
      expect(service.getIdToken()).toBeNull();
    });
  });
});
