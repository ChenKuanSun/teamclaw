import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';

// ============================================
// TeamClaw Admin API Types
// ============================================

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalTeams: number;
  activeContainers: number;
  apiKeyCount: number;
}

export interface AdminUser {
  userId: string;
  email: string;
  displayName?: string;
  teamId?: string;
  status: string;
  createdAt: string;
  lastActiveAt?: string;
}

export interface QueryUsersParams {
  limit?: number;
  offset?: number;
  email?: string;
  status?: string;
}

export interface QueryUsersResponse {
  users: AdminUser[];
  total: number;
}

export interface UpdateUserRequest {
  teamId?: string;
  status?: string;
  displayName?: string;
}

export interface Team {
  teamId: string;
  name: string;
  description?: string;
  memberIds?: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface QueryTeamsParams {
  limit?: number;
  offset?: number;
  name?: string;
}

export interface QueryTeamsResponse {
  teams: Team[];
  total: number;
}

export interface CreateTeamRequest {
  name: string;
  description: string;
}

export interface UpdateTeamRequest {
  name?: string;
  description?: string;
  memberIds?: string[];
}

export interface Container {
  userId: string;
  status: string;
  teamId?: string;
  taskArn?: string;
  startedAt?: string;
  stoppedAt?: string;
}

export interface QueryContainersParams {
  limit?: number;
  offset?: number;
  status?: string;
}

export interface QueryContainersResponse {
  containers: Container[];
  total: number;
}

export interface ProvisionContainerRequest {
  teamId?: string;
}

export interface ConfigEntry {
  configKey: string;
  value: string;
}

export interface ApiKey {
  keyId: string;
  provider: string;
  maskedKey: string;
  createdAt: string;
}

export interface AddApiKeyRequest {
  provider: string;
  key: string;
}

export interface KeyUsageStats {
  totalRequests: number;
  byProvider: { provider: string; requests: number; cost?: number }[];
}

export interface SystemAnalyticsParams {
  startDate?: string;
  endDate?: string;
}

export interface SystemAnalyticsResponse {
  totalUsers: number;
  activeUsers: number;
  totalContainers: number;
  totalApiCalls: number;
  dailyStats: { date: string; users: number; apiCalls: number }[];
}

export interface QueryUsersUsageParams {
  limit?: number;
  offset?: number;
  email?: string;
}

export interface QueryUsersUsageResponse {
  users: { userId: string; email: string; apiCalls: number; lastActiveAt?: string }[];
  total: number;
}

export interface UsageByProviderParams {
  startDate?: string;
  endDate?: string;
}

export interface UsageByProviderResponse {
  providers: { provider: string; requests: number; tokens: number; cost?: number }[];
}

export interface OnboardingStatus {
  complete: boolean;
  steps: {
    apiKey: boolean;
    team: boolean;
    allowedDomains: boolean;
    defaultTeamId: boolean;
  };
}

// ============================================
// Admin API Service
// ============================================

@Injectable({
  providedIn: 'root',
})
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.adminApiUrl;

  // ============================================
  // Dashboard
  // ============================================

  getDashboardStats() {
    return this.http.get<DashboardStats>(
      `${this.baseUrl}/admin/dashboard/stats`,
    );
  }

  // ============================================
  // Onboarding
  // ============================================

  getOnboardingStatus() {
    return this.http.get<OnboardingStatus>(
      `${this.baseUrl}/admin/onboarding/status`,
    );
  }

  // ============================================
  // Users
  // ============================================

  queryUsers(params: QueryUsersParams = {}) {
    let httpParams = new HttpParams();
    if (params.limit)
      httpParams = httpParams.set('limit', params.limit.toString());
    if (params.offset)
      httpParams = httpParams.set('offset', params.offset.toString());
    if (params.email) httpParams = httpParams.set('email', params.email);
    if (params.status) httpParams = httpParams.set('status', params.status);

    return this.http.get<QueryUsersResponse>(`${this.baseUrl}/admin/users`, {
      params: httpParams,
    });
  }

  getUser(userId: string) {
    return this.http.get<AdminUser>(
      `${this.baseUrl}/admin/users/${userId}`,
    );
  }

  updateUser(userId: string, data: UpdateUserRequest) {
    return this.http.put<AdminUser>(
      `${this.baseUrl}/admin/users/${userId}`,
      data,
    );
  }

  deleteUser(userId: string) {
    return this.http.delete<{ success: boolean }>(
      `${this.baseUrl}/admin/users/${userId}`,
    );
  }

  // ============================================
  // Teams
  // ============================================

  queryTeams(params: QueryTeamsParams = {}) {
    let httpParams = new HttpParams();
    if (params.limit)
      httpParams = httpParams.set('limit', params.limit.toString());
    if (params.offset)
      httpParams = httpParams.set('offset', params.offset.toString());
    if (params.name) httpParams = httpParams.set('name', params.name);

    return this.http.get<QueryTeamsResponse>(`${this.baseUrl}/admin/teams`, {
      params: httpParams,
    });
  }

  getTeam(teamId: string) {
    return this.http.get<Team>(
      `${this.baseUrl}/admin/teams/${teamId}`,
    );
  }

  createTeam(data: CreateTeamRequest) {
    return this.http.post<Team>(`${this.baseUrl}/admin/teams`, data);
  }

  updateTeam(teamId: string, data: UpdateTeamRequest) {
    return this.http.put<Team>(
      `${this.baseUrl}/admin/teams/${teamId}`,
      data,
    );
  }

  deleteTeam(teamId: string) {
    return this.http.delete<{ success: boolean }>(
      `${this.baseUrl}/admin/teams/${teamId}`,
    );
  }

  // ============================================
  // Containers
  // ============================================

  queryContainers(params: QueryContainersParams = {}) {
    let httpParams = new HttpParams();
    if (params.limit)
      httpParams = httpParams.set('limit', params.limit.toString());
    if (params.offset)
      httpParams = httpParams.set('offset', params.offset.toString());
    if (params.status) httpParams = httpParams.set('status', params.status);

    return this.http.get<QueryContainersResponse>(`${this.baseUrl}/admin/containers`, {
      params: httpParams,
    });
  }

  getContainer(userId: string) {
    return this.http.get<Container>(
      `${this.baseUrl}/admin/containers/${userId}`,
    );
  }

  startContainer(userId: string) {
    return this.http.post<Container>(
      `${this.baseUrl}/admin/containers/${userId}/start`,
      {},
    );
  }

  stopContainer(userId: string) {
    return this.http.post<Container>(
      `${this.baseUrl}/admin/containers/${userId}/stop`,
      {},
    );
  }

  provisionContainer(userId: string, data: ProvisionContainerRequest = {}) {
    return this.http.post<Container>(
      `${this.baseUrl}/admin/containers/${userId}/provision`,
      data,
    );
  }

  // ============================================
  // Config
  // ============================================

  getGlobalConfig() {
    return this.http.get<{ configs: ConfigEntry[] }>(
      `${this.baseUrl}/admin/config/global`,
    );
  }

  updateGlobalConfig(data: ConfigEntry) {
    return this.http.put<{ success: boolean }>(
      `${this.baseUrl}/admin/config/global`,
      data,
    );
  }

  getTeamConfig(teamId: string) {
    return this.http.get<{ configs: ConfigEntry[] }>(
      `${this.baseUrl}/admin/config/teams/${teamId}`,
    );
  }

  updateTeamConfig(teamId: string, data: ConfigEntry) {
    return this.http.put<{ success: boolean }>(
      `${this.baseUrl}/admin/config/teams/${teamId}`,
      data,
    );
  }

  getUserConfig(userId: string) {
    return this.http.get<{ configs: ConfigEntry[] }>(
      `${this.baseUrl}/admin/config/users/${userId}`,
    );
  }

  updateUserConfig(userId: string, data: ConfigEntry) {
    return this.http.put<{ success: boolean }>(
      `${this.baseUrl}/admin/config/users/${userId}`,
      data,
    );
  }

  // ============================================
  // API Keys
  // ============================================

  getApiKeys() {
    return this.http.get<{ keys: ApiKey[] }>(
      `${this.baseUrl}/admin/api-keys`,
    );
  }

  addApiKey(data: AddApiKeyRequest) {
    return this.http.post<ApiKey>(
      `${this.baseUrl}/admin/api-keys`,
      data,
    );
  }

  removeApiKey(keyId: string) {
    return this.http.delete<{ success: boolean }>(
      `${this.baseUrl}/admin/api-keys/${keyId}`,
    );
  }

  getKeyUsageStats() {
    return this.http.get<KeyUsageStats>(
      `${this.baseUrl}/admin/api-keys/usage-stats`,
    );
  }

  // ============================================
  // Analytics
  // ============================================

  getSystemAnalytics(params: SystemAnalyticsParams = {}) {
    let httpParams = new HttpParams();
    if (params.startDate)
      httpParams = httpParams.set('startDate', params.startDate.toString());
    if (params.endDate)
      httpParams = httpParams.set('endDate', params.endDate.toString());

    return this.http.get<SystemAnalyticsResponse>(
      `${this.baseUrl}/admin/analytics/system`,
      {
        params: httpParams,
      },
    );
  }

  queryUsersUsage(params: QueryUsersUsageParams = {}) {
    let httpParams = new HttpParams();
    if (params.limit)
      httpParams = httpParams.set('limit', params.limit.toString());
    if (params.offset)
      httpParams = httpParams.set('offset', params.offset.toString());
    if (params.email) httpParams = httpParams.set('email', params.email);

    return this.http.get<QueryUsersUsageResponse>(
      `${this.baseUrl}/admin/analytics/users-usage`,
      {
        params: httpParams,
      },
    );
  }

  getUsageByProvider(params: UsageByProviderParams = {}) {
    let httpParams = new HttpParams();
    if (params.startDate)
      httpParams = httpParams.set('startDate', params.startDate);
    if (params.endDate)
      httpParams = httpParams.set('endDate', params.endDate);

    return this.http.get<UsageByProviderResponse>(
      `${this.baseUrl}/admin/analytics/usage-by-provider`,
      {
        params: httpParams,
      },
    );
  }
}
