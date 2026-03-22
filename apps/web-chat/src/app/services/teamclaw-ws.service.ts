import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ChatOption {
  label: string;
  value: string;
  icon?: string;
  action: string; // e.g. 'set-model', 'switch-session'
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  options?: ChatOption[]; // Interactive clickable options
}

@Injectable({ providedIn: 'root' })
export class TeamClawWsService implements OnDestroy {
  private ws: WebSocket | null = null;
  private idCounter = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private gatewayUrl = '';
  private token = '';
  private sessionKey = 'agent:main:main';
  private activeRunId: string | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;

  /** Emitted when reconnection fails repeatedly — chat component should navigate to /session */
  readonly reconnectFailed$ = new BehaviorSubject<boolean>(false);

  private static readonly STORAGE_KEY = 'tc-chat-history';

  readonly messages$ = new BehaviorSubject<ChatMessage[]>(
    this.loadFromStorage(),
  );

  constructor() {
    // Persist messages to sessionStorage on every change
    this.messages$.subscribe(() => this.saveToStorage());
  }
  readonly connected$ = new BehaviorSubject<boolean>(false);
  readonly typing$ = new BehaviorSubject<boolean>(false);

  connect(gatewayUrl: string, token: string): void {
    this.gatewayUrl = gatewayUrl;
    this.token = token;
    this.reconnectAttempts = 0;
    this.reconnectFailed$.next(false);
    this.doConnect();
  }

  private doConnect(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }

    this.ws = new WebSocket(this.gatewayUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      // Wait for connect.challenge from server
    };

    this.ws.onmessage = event => {
      try {
        const frame = JSON.parse(event.data);
        this.handleFrame(frame);
      } catch (err) {
        console.error('[ws] Failed to parse frame:', err);
      }
    };

    this.ws.onclose = event => {
      this.connected$.next(false);
      this.stopTick();
      // Don't reconnect on auth failures
      if (event.code === 1008 || event.code >= 4400) {
        console.error(
          '[ws] Auth failure, not reconnecting:',
          event.code,
          event.reason,
        );
        this.reconnectFailed$.next(true);
        return;
      }
      this.reconnectAttempts++;
      if (this.reconnectAttempts > this.MAX_RECONNECT_ATTEMPTS) {
        // Container likely stopped — need to go through session init to restart
        console.warn(
          '[ws] Max reconnect attempts reached, falling back to session init',
        );
        this.reconnectFailed$.next(true);
        return;
      }
      this.reconnectTimer = setTimeout(() => this.doConnect(), 3000);
    };

    this.ws.onerror = event => {
      console.error('[ws] WebSocket error:', event);
    };
  }

  sendMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    this.messages$.next([...this.messages$.value, userMsg]);
    this.typing$.next(true);

    this.sendReq('chat.send', {
      sessionKey: this.sessionKey,
      message: text,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopTick();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private handleFrame(frame: any): void {
    switch (frame.type) {
      case 'event':
        this.handleEvent(frame);
        break;
      case 'res':
        this.handleResponse(frame);
        break;
    }
  }

  private handleEvent(frame: any): void {
    switch (frame.event) {
      case 'connect.challenge':
        this.sendConnect();
        break;

      // Ignore infrastructure events — don't display to user
      case 'heartbeat':
      case 'health':
      case 'presence':
      case 'shutdown':
      case 'tick':
        break;

      case 'agent': {
        const p = frame.payload;
        if (p?.stream === 'assistant' && p?.data?.delta) {
          // Filter out heartbeat/health content that leaks into assistant stream
          const delta = p.data.delta;
          if (typeof delta === 'string' && (delta.includes('HEARTBEAT') || delta.includes('HEALTH_CHECK'))) {
            break;
          }
          this.appendAssistantDelta(delta);
        } else if (p?.stream === 'lifecycle') {
          if (p.data?.phase === 'start') {
            this.activeRunId = p.runId;
            this.typing$.next(true);
          } else if (p.data?.phase === 'end' || p.data?.phase === 'error') {
            this.activeRunId = null;
            this.typing$.next(false);
          }
        }
        break;
      }

      case 'chat': {
        const p = frame.payload;
        if (p?.state === 'final' && p?.message?.content) {
          const text = p.message.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('');
          if (text) {
            const msgs = [...this.messages$.value];
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg?.role === 'assistant') {
              msgs[msgs.length - 1] = { ...lastMsg, content: text };
            } else {
              msgs.push({
                role: 'assistant',
                content: text,
                timestamp: new Date(),
              });
            }
            this.messages$.next(msgs);
          }
          this.typing$.next(false);
        } else if (p?.state === 'error' && p?.errorMessage) {
          const errMsg: ChatMessage = {
            role: 'system',
            content: `Error: ${p.errorMessage}`,
            timestamp: new Date(),
          };
          this.messages$.next([...this.messages$.value, errMsg]);
          this.typing$.next(false);
        }
        break;
      }

      case 'chat.typing':
      case 'agent.typing':
        this.typing$.next(true);
        break;

      case 'chat.typing.stop':
      case 'agent.typing.stop':
        this.typing$.next(false);
        break;
    }
  }

  private appendAssistantDelta(text: string): void {
    const msgs = [...this.messages$.value];
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg?.role === 'assistant') {
      msgs[msgs.length - 1] = { ...lastMsg, content: lastMsg.content + text };
    } else {
      msgs.push({ role: 'assistant', content: text, timestamp: new Date() });
    }
    this.messages$.next(msgs);
  }

  private handleResponse(frame: any): void {
    if (frame.payload?.type === 'hello-ok') {
      this.connected$.next(true);
      this.sessionKey =
        frame.payload?.snapshot?.sessionDefaults?.mainSessionKey ||
        'agent:main:main';
      const tickMs = frame.payload?.policy?.tickIntervalMs || 15000;
      this.startTick(tickMs);
      this.loadHistory();
    }

    if (frame.id === this.historyReqId && frame.ok) {
      this.parseHistory(frame.payload);
    }

    // Ignore tick/heartbeat response errors silently
    if (!frame.ok && frame.error && frame.error.message !== 'unknown method: tick') {
      console.error('[ws] error:', frame.error.message);
    }
  }

  private historyReqId = '';

  private loadHistory(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.historyReqId = this.nextId();
    this.ws.send(
      JSON.stringify({
        type: 'req',
        id: this.historyReqId,
        method: 'sessions.preview',
        params: { keys: [this.sessionKey], limit: 50 },
      }),
    );
  }

  private parseHistory(payload: any): void {
    const previews =
      payload?.previews || (Array.isArray(payload) ? payload : []);
    const preview = previews[0];
    const items = preview?.items;
    if (!Array.isArray(items) || items.length === 0) return;

    const history: ChatMessage[] = [];
    for (const item of items) {
      if (item.role === 'user') {
        // Extract actual user message (strip sender metadata prefix)
        const match = item.text?.match(/\] (.+)$/s);
        history.push({
          role: 'user',
          content: match ? match[1] : item.text || '',
          timestamp: new Date(),
        });
      } else if (item.role === 'assistant') {
        history.push({
          role: 'assistant',
          content: item.text || '',
          timestamp: new Date(),
        });
      }
    }
    if (history.length > 0) {
      this.messages$.next(history);
    }
  }

  private sendConnect(): void {
    const id = this.nextId();
    const params: any = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'openclaw-control-ui',
        mode: 'ui',
        version: '1.0.0',
        platform: 'web',
      },
      scopes: ['operator.admin', 'operator.read', 'operator.write'],
      caps: [],
    };

    this.ws?.send(
      JSON.stringify({ type: 'req', id, method: 'connect', params }),
    );
  }

  private sendReq(method: string, params: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({ type: 'req', id: this.nextId(), method, params }),
    );
  }

  executeCommand(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }
      const id = this.nextId();
      const handler = (event: MessageEvent) => {
        let frame: any;
        try {
          frame = JSON.parse(event.data);
        } catch (err) {
          console.error('[ws] Failed to parse command response:', err);
          return;
        }
        if (frame.type === 'res' && frame.id === id) {
          this.ws?.removeEventListener('message', handler);
          if (frame.ok) resolve(frame.payload);
          else reject(new Error(frame.error?.message || 'Command failed'));
        }
      };
      this.ws.addEventListener('message', handler);
      this.ws.send(JSON.stringify({ type: 'req', id, method, params }));
      // Timeout after 10s
      setTimeout(() => {
        this.ws?.removeEventListener('message', handler);
        reject(new Error('Command timeout'));
      }, 10000);
    });
  }

  getSessionKey(): string {
    return this.sessionKey;
  }

  switchSession(key: string): void {
    this.sessionKey = key;
    this.messages$.next([]);
    this.loadHistory();
  }

  resetSession(): void {
    this.executeCommand('sessions.reset', {
      key: this.sessionKey,
      reason: 'new',
    })
      .then(() => {
        sessionStorage.removeItem(TeamClawWsService.STORAGE_KEY);
        this.messages$.next([]);
      })
      .catch(err => console.error('[ws] reset failed:', err.message));
  }

  private nextId(): string {
    return `ec-${++this.idCounter}`;
  }

  private startTick(intervalMs: number): void {
    this.stopTick();
    this.tickTimer = setInterval(() => {
      this.sendReq('tick', {});
    }, intervalMs);
  }

  private stopTick(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private saveToStorage(): void {
    try {
      // Keep last 100 messages to avoid storage bloat
      const msgs = this.messages$.value.slice(-100).map(m => ({
        ...m,
        timestamp:
          m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
      }));
      sessionStorage.setItem(
        TeamClawWsService.STORAGE_KEY,
        JSON.stringify(msgs),
      );
    } catch {
      /* storage full or unavailable */
    }
  }

  private loadFromStorage(): ChatMessage[] {
    try {
      const raw = sessionStorage.getItem(TeamClawWsService.STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return (parsed as any[]).map(m => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
    } catch {
      return [];
    }
  }
}
