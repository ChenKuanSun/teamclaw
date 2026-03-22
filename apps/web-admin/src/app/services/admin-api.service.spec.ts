import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AdminApiService } from './admin-api.service';
import { environment } from '../../environments/environment';

describe('AdminApiService', () => {
  let service: AdminApiService;
  let httpMock: HttpTestingController;
  const baseUrl = environment.adminApiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AdminApiService,
      ],
    });

    service = TestBed.inject(AdminApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ============================================
  // Dashboard
  // ============================================

  describe('Dashboard', () => {
    it('getDashboardStats() should GET /admin/dashboard/stats', () => {
      const mockStats = {
        totalUsers: 10,
        activeUsers: 5,
        totalTeams: 3,
        activeContainers: 2,
        apiKeyCount: 4,
      };

      service.getDashboardStats().subscribe((data) => {
        expect(data).toEqual(mockStats);
      });

      const req = httpMock.expectOne(`${baseUrl}/admin/dashboard/stats`);
      expect(req.request.method).toBe('GET');
      req.flush(mockStats);
    });
  });

  // ============================================
  // Users
  // ============================================

  describe('Users', () => {
    it('queryUsers() should GET /admin/users with no params', () => {
      service.queryUsers().subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/users`);
      expect(req.request.method).toBe('GET');
      req.flush({ users: [], total: 0 });
    });

    it('queryUsers() should pass HttpParams', () => {
      service
        .queryUsers({ limit: 10, offset: 20, email: 'test@x.com', status: 'active' })
        .subscribe();

      const req = httpMock.expectOne((r) => r.url === `${baseUrl}/admin/users`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('limit')).toBe('10');
      expect(req.request.params.get('offset')).toBe('20');
      expect(req.request.params.get('email')).toBe('test@x.com');
      expect(req.request.params.get('status')).toBe('active');
      req.flush({ users: [], total: 0 });
    });

    it('getUser() should GET /admin/users/:id', () => {
      service.getUser('user-1').subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/users/user-1`);
      expect(req.request.method).toBe('GET');
      req.flush({ userId: 'user-1', email: 'a@b.com', status: 'active', createdAt: '' });
    });

    it('updateUser() should PUT /admin/users/:id', () => {
      const data = { status: 'disabled' };
      service.updateUser('user-1', data).subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/users/user-1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(data);
      req.flush({ userId: 'user-1', email: 'a@b.com', status: 'disabled', createdAt: '' });
    });

    it('deleteUser() should DELETE /admin/users/:id', () => {
      service.deleteUser('user-1').subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/users/user-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ success: true });
    });
  });

  // ============================================
  // Teams
  // ============================================

  describe('Teams', () => {
    it('queryTeams() should GET /admin/teams with no params', () => {
      service.queryTeams().subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/teams`);
      expect(req.request.method).toBe('GET');
      req.flush({ teams: [], total: 0 });
    });

    it('queryTeams() should pass HttpParams', () => {
      service.queryTeams({ limit: 5, offset: 10, name: 'eng' }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${baseUrl}/admin/teams`);
      expect(req.request.params.get('limit')).toBe('5');
      expect(req.request.params.get('offset')).toBe('10');
      expect(req.request.params.get('name')).toBe('eng');
      req.flush({ teams: [], total: 0 });
    });

    it('getTeam() should GET /admin/teams/:id', () => {
      service.getTeam('team-1').subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/teams/team-1`);
      expect(req.request.method).toBe('GET');
      req.flush({ teamId: 'team-1', name: 'Eng', createdAt: '' });
    });

    it('createTeam() should POST /admin/teams', () => {
      const data = { name: 'New Team', description: 'Desc' };
      service.createTeam(data).subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/teams`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(data);
      req.flush({ teamId: 'team-2', name: 'New Team', createdAt: '' });
    });

    it('updateTeam() should PUT /admin/teams/:id', () => {
      const data = { name: 'Updated' };
      service.updateTeam('team-1', data).subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/teams/team-1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(data);
      req.flush({ teamId: 'team-1', name: 'Updated', createdAt: '' });
    });

    it('deleteTeam() should DELETE /admin/teams/:id', () => {
      service.deleteTeam('team-1').subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/teams/team-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ success: true });
    });
  });

  // ============================================
  // Containers
  // ============================================

  describe('Containers', () => {
    it('queryContainers() should GET /admin/containers with no params', () => {
      service.queryContainers().subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/containers`);
      expect(req.request.method).toBe('GET');
      req.flush({ containers: [], total: 0 });
    });

    it('queryContainers() should pass HttpParams', () => {
      service.queryContainers({ limit: 10, offset: 0, status: 'RUNNING' }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${baseUrl}/admin/containers`);
      expect(req.request.params.get('limit')).toBe('10');
      expect(req.request.params.get('status')).toBe('RUNNING');
      req.flush({ containers: [], total: 0 });
    });

    it('getContainer() should GET /admin/containers/:userId', () => {
      service.getContainer('user-1').subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/containers/user-1`);
      expect(req.request.method).toBe('GET');
      req.flush({ userId: 'user-1', status: 'RUNNING' });
    });

    it('startContainer() should POST /admin/containers/:userId/start', () => {
      service.startContainer('user-1').subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/containers/user-1/start`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ userId: 'user-1', status: 'RUNNING' });
    });

    it('stopContainer() should POST /admin/containers/:userId/stop', () => {
      service.stopContainer('user-1').subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/containers/user-1/stop`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ userId: 'user-1', status: 'STOPPED' });
    });

    it('provisionContainer() should POST /admin/containers/:userId/provision', () => {
      const data = { teamId: 'team-1' };
      service.provisionContainer('user-1', data).subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/containers/user-1/provision`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(data);
      req.flush({ userId: 'user-1', status: 'PROVISIONING' });
    });

    it('provisionContainer() should default to empty body', () => {
      service.provisionContainer('user-1').subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/containers/user-1/provision`);
      expect(req.request.body).toEqual({});
      req.flush({ userId: 'user-1', status: 'PROVISIONING' });
    });
  });

  // ============================================
  // Config
  // ============================================

  describe('Config', () => {
    it('getGlobalConfig() should GET /admin/config/global', () => {
      service.getGlobalConfig().subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/config/global`);
      expect(req.request.method).toBe('GET');
      req.flush({ configs: [] });
    });

    it('updateGlobalConfig() should PUT /admin/config/global', () => {
      const data = { configKey: 'max_tokens', value: '4096' };
      service.updateGlobalConfig(data).subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/config/global`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(data);
      req.flush({ success: true });
    });

    it('getTeamConfig() should GET /admin/config/teams/:teamId', () => {
      service.getTeamConfig('team-1').subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/config/teams/team-1`);
      expect(req.request.method).toBe('GET');
      req.flush({ configs: [] });
    });

    it('updateTeamConfig() should PUT /admin/config/teams/:teamId', () => {
      const data = { configKey: 'model', value: 'gpt-4' };
      service.updateTeamConfig('team-1', data).subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/config/teams/team-1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(data);
      req.flush({ success: true });
    });

    it('getUserConfig() should GET /admin/config/users/:userId', () => {
      service.getUserConfig('user-1').subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/config/users/user-1`);
      expect(req.request.method).toBe('GET');
      req.flush({ configs: [] });
    });

    it('updateUserConfig() should PUT /admin/config/users/:userId', () => {
      const data = { configKey: 'theme', value: 'dark' };
      service.updateUserConfig('user-1', data).subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/config/users/user-1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(data);
      req.flush({ success: true });
    });
  });

  // ============================================
  // API Keys
  // ============================================

  describe('API Keys', () => {
    it('getApiKeys() should GET /admin/api-keys', () => {
      service.getApiKeys().subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/api-keys`);
      expect(req.request.method).toBe('GET');
      req.flush({ keys: [] });
    });

    it('addApiKey() should POST /admin/api-keys', () => {
      const data = { provider: 'openai', key: 'sk-123' };
      service.addApiKey(data).subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/api-keys`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(data);
      req.flush({ keyId: 'k1', provider: 'openai', maskedKey: 'sk-***', createdAt: '' });
    });

    it('removeApiKey() should DELETE /admin/api-keys/:keyId', () => {
      service.removeApiKey('k1').subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/api-keys/k1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ success: true });
    });

    it('getKeyUsageStats() should GET /admin/api-keys/usage-stats', () => {
      service.getKeyUsageStats().subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/api-keys/usage-stats`);
      expect(req.request.method).toBe('GET');
      req.flush({ totalRequests: 100, byProvider: [] });
    });
  });

  // ============================================
  // Analytics
  // ============================================

  describe('Analytics', () => {
    it('getSystemAnalytics() should GET /admin/analytics/system with no params', () => {
      service.getSystemAnalytics().subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/analytics/system`);
      expect(req.request.method).toBe('GET');
      req.flush({ totalUsers: 0, activeUsers: 0, totalContainers: 0, totalApiCalls: 0, dailyStats: [] });
    });

    it('getSystemAnalytics() should pass date params', () => {
      service
        .getSystemAnalytics({ startDate: '2026-01-01', endDate: '2026-01-31' })
        .subscribe();
      const req = httpMock.expectOne(
        (r) => r.url === `${baseUrl}/admin/analytics/system`,
      );
      expect(req.request.params.get('startDate')).toBe('2026-01-01');
      expect(req.request.params.get('endDate')).toBe('2026-01-31');
      req.flush({ totalUsers: 0, activeUsers: 0, totalContainers: 0, totalApiCalls: 0, dailyStats: [] });
    });

    it('queryUsersUsage() should GET /admin/analytics/users-usage with no params', () => {
      service.queryUsersUsage().subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/analytics/users-usage`);
      expect(req.request.method).toBe('GET');
      req.flush({ users: [], total: 0 });
    });

    it('queryUsersUsage() should pass HttpParams', () => {
      service.queryUsersUsage({ limit: 10, offset: 5, email: 'a@b.com' }).subscribe();
      const req = httpMock.expectOne(
        (r) => r.url === `${baseUrl}/admin/analytics/users-usage`,
      );
      expect(req.request.params.get('limit')).toBe('10');
      expect(req.request.params.get('offset')).toBe('5');
      expect(req.request.params.get('email')).toBe('a@b.com');
      req.flush({ users: [], total: 0 });
    });

    it('getUsageByProvider() should GET /admin/analytics/usage-by-provider with no params', () => {
      service.getUsageByProvider().subscribe();
      const req = httpMock.expectOne(`${baseUrl}/admin/analytics/usage-by-provider`);
      expect(req.request.method).toBe('GET');
      req.flush({ providers: [] });
    });

    it('getUsageByProvider() should pass date params', () => {
      service
        .getUsageByProvider({ startDate: '2026-01-01', endDate: '2026-01-31' })
        .subscribe();
      const req = httpMock.expectOne(
        (r) => r.url === `${baseUrl}/admin/analytics/usage-by-provider`,
      );
      expect(req.request.params.get('startDate')).toBe('2026-01-01');
      expect(req.request.params.get('endDate')).toBe('2026-01-31');
      req.flush({ providers: [] });
    });
  });
});
