import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let authService: {
    getIdToken: jest.Mock;
    signOut: jest.Mock;
  };

  beforeEach(() => {
    authService = {
      getIdToken: jest.fn(),
      signOut: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authService },
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should attach Bearer token when token is available', () => {
    authService.getIdToken.mockReturnValue('test-jwt-token');

    httpClient.get('/api/data').subscribe();

    const req = httpMock.expectOne('/api/data');
    expect(req.request.headers.get('Authorization')).toBe(
      'Bearer test-jwt-token',
    );
    req.flush({});
  });

  it('should not attach Authorization header when no token', () => {
    authService.getIdToken.mockReturnValue(null);

    httpClient.get('/api/data').subscribe();

    const req = httpMock.expectOne('/api/data');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should skip auth header for asset requests', () => {
    authService.getIdToken.mockReturnValue('test-jwt-token');

    httpClient.get('/assets/i18n/en.json').subscribe();

    const req = httpMock.expectOne('/assets/i18n/en.json');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should call signOut on 401 response', () => {
    authService.getIdToken.mockReturnValue('test-jwt-token');

    httpClient.get('/api/data').subscribe({
      error: () => {
        // expected error
      },
    });

    const req = httpMock.expectOne('/api/data');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(authService.signOut).toHaveBeenCalled();
  });

  it('should not call signOut on non-401 errors', () => {
    authService.getIdToken.mockReturnValue('test-jwt-token');

    httpClient.get('/api/data').subscribe({
      error: () => {
        // expected error
      },
    });

    const req = httpMock.expectOne('/api/data');
    req.flush('Server Error', {
      status: 500,
      statusText: 'Internal Server Error',
    });

    expect(authService.signOut).not.toHaveBeenCalled();
  });

  it('should propagate the error to subscribers', () => {
    authService.getIdToken.mockReturnValue('test-jwt-token');
    let errorReceived = false;

    httpClient.get('/api/data').subscribe({
      error: err => {
        errorReceived = true;
        expect(err.status).toBe(403);
      },
    });

    const req = httpMock.expectOne('/api/data');
    req.flush('Forbidden', { status: 403, statusText: 'Forbidden' });

    expect(errorReceived).toBe(true);
  });
});
