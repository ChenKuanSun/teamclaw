import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';

export interface UserIntegration {
  integrationId: string;
  displayName: string;
  icon: string;
  category: string;
  credentialSource: 'global' | 'team' | 'personal' | 'none';
  teamName?: string;
  allowUserOverride: boolean;
  credentialSchema?: {
    key: string;
    label: string;
    type: 'secret' | 'text';
    required: boolean;
    placeholder?: string;
  }[];
}

@Injectable({ providedIn: 'root' })
export class IntegrationsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.adminApiUrl;

  listMyIntegrations() {
    return this.http.get<{ integrations: UserIntegration[] }>(
      `${this.baseUrl}/user/integrations`,
    );
  }

  connectIntegration(id: string, credentials: Record<string, string>) {
    return this.http.post(`${this.baseUrl}/user/integrations/${id}/connect`, {
      credentials,
    });
  }

  disconnectIntegration(id: string) {
    return this.http.delete(`${this.baseUrl}/user/integrations/${id}/connect`);
  }
}
