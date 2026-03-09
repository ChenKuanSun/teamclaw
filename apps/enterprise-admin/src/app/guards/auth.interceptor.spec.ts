import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { authInterceptor } from './auth.interceptor';
import { AdminAuthService } from '../services/admin-auth.service';
import { environment } from '../../environments/environment';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let authService: {
    idToken: jest.Mock;
    isRefreshing: jest.Mock;
    setRefreshing: jest.Mock;
    refreshAccessToken: jest.Mock;
    signOut: jest.Mock;
  };

  const adminUrl = environment.adminApiUrl;

  beforeEach(() => {
    authService = {
      idToken: jest.fn().mockReturnValue('mock-id-token'),
      isRefreshing: jest.fn().mockReturnValue(false),
      setRefreshing: jest.fn(),
      refreshAccessToken: jest.fn().mockResolvedValue(true),
      signOut: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AdminAuthService, useValue: authService },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should add Bearer token to admin API requests', () => {
    httpClient.get(`${adminUrl}/admin/dashboard/stats`).subscribe();

    const req = httpMock.expectOne(`${adminUrl}/admin/dashboard/stats`);
    expect(req.request.headers.get('Authorization')).toBe(
      'Bearer mock-id-token',
    );
    req.flush({});
  });

  it('should not add token to non-admin API requests', () => {
    httpClient.get('https://other-api.com/data').subscribe();

    const req = httpMock.expectOne('https://other-api.com/data');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should not add token when no token available', () => {
    authService.idToken.mockReturnValue('');

    httpClient.get(`${adminUrl}/admin/users`).subscribe();

    const req = httpMock.expectOne(`${adminUrl}/admin/users`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should attempt refresh on 401 and retry request', fakeAsync(() => {
    const newToken = 'refreshed-id-token';
    authService.refreshAccessToken.mockResolvedValue(true);
    // After refresh, idToken returns new token
    let callCount = 0;
    authService.idToken.mockImplementation(() => {
      callCount++;
      return callCount <= 1 ? 'old-token' : newToken;
    });

    let responseData: unknown;
    httpClient.get(`${adminUrl}/admin/users`).subscribe({
      next: (data) => {
        responseData = data;
      },
    });

    // First request returns 401
    const firstReq = httpMock.expectOne(`${adminUrl}/admin/users`);
    firstReq.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    // Flush the Promise from refreshAccessToken
    tick();

    // After refresh, interceptor retries
    const retryReq = httpMock.expectOne(`${adminUrl}/admin/users`);
    expect(retryReq.request.headers.get('Authorization')).toBe(
      `Bearer ${newToken}`,
    );
    retryReq.flush({ users: [] });

    tick();

    expect(responseData).toEqual({ users: [] });
    expect(authService.setRefreshing).toHaveBeenCalledWith(true);
    expect(authService.setRefreshing).toHaveBeenCalledWith(false);
  }));

  it('should sign out when refresh fails on 401', fakeAsync(() => {
    authService.refreshAccessToken.mockResolvedValue(false);

    let receivedError: unknown;
    httpClient.get(`${adminUrl}/admin/users`).subscribe({
      error: (err) => {
        receivedError = err;
      },
    });

    const req = httpMock.expectOne(`${adminUrl}/admin/users`);
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    // Flush the Promise from refreshAccessToken
    tick();

    expect(authService.signOut).toHaveBeenCalled();
    expect(receivedError).toBeDefined();
  }));

  it('should sign out when refresh throws error on 401', fakeAsync(() => {
    authService.refreshAccessToken.mockRejectedValue(new Error('refresh error'));

    httpClient.get(`${adminUrl}/admin/users`).subscribe({
      error: () => {
        // expected
      },
    });

    const req = httpMock.expectOne(`${adminUrl}/admin/users`);
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    tick();

    expect(authService.setRefreshing).toHaveBeenCalledWith(false);
    expect(authService.signOut).toHaveBeenCalled();
  }));

  it('should not attempt refresh if already refreshing', () => {
    authService.isRefreshing.mockReturnValue(true);

    httpClient.get(`${adminUrl}/admin/users`).subscribe({
      error: (err) => {
        expect(err.status).toBe(401);
      },
    });

    const req = httpMock.expectOne(`${adminUrl}/admin/users`);
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(authService.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('should not attempt refresh for non-admin API 401', () => {
    httpClient.get('https://other-api.com/data').subscribe({
      error: (err) => {
        expect(err.status).toBe(401);
      },
    });

    const req = httpMock.expectOne('https://other-api.com/data');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(authService.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('should pass through non-401 errors', () => {
    httpClient.get(`${adminUrl}/admin/users`).subscribe({
      error: (err) => {
        expect(err.status).toBe(500);
      },
    });

    const req = httpMock.expectOne(`${adminUrl}/admin/users`);
    req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });

    expect(authService.refreshAccessToken).not.toHaveBeenCalled();
  });
});
