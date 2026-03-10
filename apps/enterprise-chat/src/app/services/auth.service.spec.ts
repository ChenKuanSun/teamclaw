import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
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
  let mockRouter: { navigate: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    MockCognitoUserPool.prototype.getCurrentUser = jest.fn().mockReturnValue(null);
    mockRouter = { navigate: jest.fn() };
  });

  function createService(): AuthService {
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: mockRouter },
      ],
    });
    return TestBed.inject(AuthService);
  }

  describe('initialization', () => {
    it('should create', () => {
      const service = createService();
      expect(service).toBeTruthy();
    });

    it('should initialize as not authenticated when no current user', () => {
      const service = createService();
      expect(service.isAuthenticated()).toBe(false);
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

      expect(service.isAuthenticated()).toBe(true);
      expect(service.user()).toBe(mockUser);
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

      expect(service.isAuthenticated()).toBe(false);
    });

    it('should not restore session if getSession returns error', () => {
      const mockUser = {
        getSession: jest.fn((cb: (err: Error | null, session: CognitoUserSession) => void) => {
          cb(new Error('Session expired'), null as unknown as CognitoUserSession);
        }),
      } as unknown as CognitoUser;

      MockCognitoUserPool.prototype.getCurrentUser = jest.fn().mockReturnValue(mockUser);

      const service = createService();

      expect(service.isAuthenticated()).toBe(false);
    });
  });

  describe('login', () => {
    it('should authenticate user and update signals on success', async () => {
      const mockSession = {
        isValid: jest.fn().mockReturnValue(true),
      } as unknown as CognitoUserSession;
      MockCognitoUser.prototype.authenticateUser = jest.fn((_authDetails, callbacks) => {
        callbacks.onSuccess(mockSession);
      });

      const service = createService();
      const result = await service.login('test@example.com', 'password123');

      expect(result).toBe(mockSession);
      expect(service.user()).toBeTruthy();
      expect(service.isAuthenticated()).toBe(true);
      expect(service.isLoading()).toBe(false);
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
      expect(service.isAuthenticated()).toBe(false);
      expect(service.isLoading()).toBe(false);
      expect(service.errorMessage()).toBe('Incorrect username or password');
    });
  });

  describe('signOut', () => {
    it('should sign out and navigate to login', () => {
      const mockSignOut = jest.fn();
      const mockCurrentUser = { signOut: mockSignOut } as unknown as CognitoUser;

      const service = createService();

      const poolInstance = MockCognitoUserPool.mock.instances[MockCognitoUserPool.mock.instances.length - 1];
      (poolInstance.getCurrentUser as jest.Mock).mockReturnValue(mockCurrentUser);

      service.signOut();

      expect(mockSignOut).toHaveBeenCalled();
      expect(service.isAuthenticated()).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should handle signOut when no current user exists', () => {
      const service = createService();
      MockCognitoUserPool.prototype.getCurrentUser = jest.fn().mockReturnValue(null);

      expect(() => service.signOut()).not.toThrow();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('getIdToken', () => {
    it('should return null when no session exists', () => {
      const service = createService();
      expect(service.getIdToken()).toBeNull();
    });
  });

  describe('redirectToLogin', () => {
    it('should navigate to /login', () => {
      const service = createService();
      service.redirectToLogin();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });
  });
});
