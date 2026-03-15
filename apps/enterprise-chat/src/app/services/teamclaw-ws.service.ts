import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

@Injectable({ providedIn: 'root' })
export class TeamClawWsService implements OnDestroy {
  private ws: WebSocket | null = null;
  private idCounter = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private gatewayUrl = '';
  private token = '';

  readonly messages$ = new BehaviorSubject<ChatMessage[]>([]);
  readonly connected$ = new BehaviorSubject<boolean>(false);
  readonly typing$ = new BehaviorSubject<boolean>(false);

  connect(gatewayUrl: string, token: string): void {
    this.gatewayUrl = gatewayUrl;
    this.token = token;
    this.doConnect();
  }

  private doConnect(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }

    this.ws = new WebSocket(this.gatewayUrl);

    this.ws.onopen = () => {
      // Wait for connect.challenge from server before sending connect
    };

    this.ws.onmessage = (event) => {
      const frame = JSON.parse(event.data);
      this.handleFrame(frame);
    };

    this.ws.onclose = () => {
      this.connected$.next(false);
      this.stopTick();
      // Auto-reconnect after 3s
      this.reconnectTimer = setTimeout(() => this.doConnect(), 3000);
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  sendMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date() };
    this.messages$.next([...this.messages$.value, userMsg]);

    this.sendReq('chat.send', { text });
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
        // Server sent challenge — send connect request
        this.sendConnect(frame.payload?.nonce);
        break;

      case 'chat.message':
      case 'chat.chunk': {
        const msg: ChatMessage = {
          role: frame.payload?.role || 'assistant',
          content: frame.payload?.text || frame.payload?.content || '',
          timestamp: new Date(frame.payload?.ts || Date.now()),
        };
        if (msg.content) {
          // For streaming chunks, append to the last assistant message
          const msgs = [...this.messages$.value];
          const lastMsg = msgs[msgs.length - 1];
          if (frame.event === 'chat.chunk' && lastMsg?.role === 'assistant') {
            msgs[msgs.length - 1] = { ...lastMsg, content: lastMsg.content + msg.content };
            this.messages$.next(msgs);
          } else {
            this.messages$.next([...msgs, msg]);
          }
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

  private handleResponse(frame: any): void {
    if (!frame.ok) return;

    if (frame.payload?.type === 'hello-ok') {
      this.connected$.next(true);
      // Start tick keepalive
      const tickMs = frame.payload?.policy?.tickIntervalMs || 15000;
      this.startTick(tickMs);
      // Load chat history
      this.sendReq('chat.history', {});
    }

    if (frame.method === 'chat.history' && frame.payload?.messages) {
      const history = (frame.payload.messages as any[]).map((m: any) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.text || m.content || '',
        timestamp: new Date(m.ts || m.timestamp || Date.now()),
      }));
      this.messages$.next(history);
    }
  }

  private sendConnect(nonce?: string): void {
    const id = this.nextId();
    const params: any = {
      minProtocol: 3,
      maxProtocol: 3,
      client: { id: 'enterprise-chat', version: '1.0.0', platform: 'web' },
      role: 'user',
      scopes: ['chat'],
      caps: [],
    };

    // For trusted-proxy mode, no token/device needed
    // The proxy (ALB) handles auth
    if (this.token) {
      params.auth = { token: this.token };
    }

    if (nonce) {
      params.nonce = nonce;
    }

    this.ws?.send(JSON.stringify({ type: 'req', id, method: 'connect', params }));
  }

  private sendReq(method: string, params: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'req', id: this.nextId(), method, params }));
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
}
