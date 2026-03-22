import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { SessionResponse, SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(SessionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should call POST /user/session', () => {
    const mockResponse: SessionResponse = {
      status: 'ready',
      userId: 'user-123',
      gatewayUrl: 'wss://example.com',
    };

    service.initSession().subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne(`${environment.adminApiUrl}/user/session`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(mockResponse);
  });

  it('should return SessionResponse observable with provisioning status', () => {
    const mockResponse: SessionResponse = {
      status: 'provisioning',
      userId: 'user-456',
      message: 'Setting up workspace...',
      estimatedWaitSeconds: 30,
    };

    service.initSession().subscribe(res => {
      expect(res.status).toBe('provisioning');
      expect(res.message).toBe('Setting up workspace...');
      expect(res.estimatedWaitSeconds).toBe(30);
    });

    const req = httpMock.expectOne(`${environment.adminApiUrl}/user/session`);
    req.flush(mockResponse);
  });

  it('should propagate HTTP errors', () => {
    service.initSession().subscribe({
      error: err => {
        expect(err.status).toBe(403);
      },
    });

    const req = httpMock.expectOne(`${environment.adminApiUrl}/user/session`);
    req.flush(
      { message: 'Forbidden' },
      { status: 403, statusText: 'Forbidden' },
    );
  });
});
