import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { IntegrationsService } from './integrations.service';

describe('IntegrationsService', () => {
  let service: IntegrationsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        IntegrationsService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(IntegrationsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('listMyIntegrations()', () => {
    it('should GET /user/integrations', () => {
      const mockResponse = {
        integrations: [
          {
            integrationId: 'github',
            displayName: 'GitHub',
            icon: 'code',
            category: 'dev',
            credentialSource: 'global' as const,
            allowUserOverride: true,
          },
        ],
      };

      service.listMyIntegrations().subscribe(res => {
        expect(res.integrations.length).toBe(1);
        expect(res.integrations[0].integrationId).toBe('github');
      });

      const req = httpMock.expectOne(r => r.url.endsWith('/user/integrations'));
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });
  });

  describe('connectIntegration()', () => {
    it('should POST to /user/integrations/:id/connect', () => {
      const creds = { token: 'ghp_abc' };

      service.connectIntegration('github', creds).subscribe();

      const req = httpMock.expectOne(r =>
        r.url.endsWith('/user/integrations/github/connect'),
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ credentials: creds });
      req.flush({ success: true });
    });
  });

  describe('disconnectIntegration()', () => {
    it('should DELETE /user/integrations/:id/connect', () => {
      service.disconnectIntegration('github').subscribe();

      const req = httpMock.expectOne(r =>
        r.url.endsWith('/user/integrations/github/connect'),
      );
      expect(req.request.method).toBe('DELETE');
      req.flush({ success: true });
    });
  });
});
