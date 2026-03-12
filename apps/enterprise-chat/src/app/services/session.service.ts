import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SessionResponse {
  status: 'ready' | 'starting' | 'provisioning';
  userId: string;
  message?: string;
  estimatedWaitSeconds?: number;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);

  initSession(): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(
      `${environment.adminApiUrl}/user/session`,
      {},
    );
  }
}
