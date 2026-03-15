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
  private sessionKey = 'agent:main:main';
  private activeRunId: string | null = null;

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
      // Wait for connect.challenge from server
    };

    this.ws.onmessage = (event) => {
      const frame = JSON.parse(event.data);
      this.handleFrame(frame);
    };

    this.ws.onclose = () => {
      this.connected$.next(false);
      this.stopTick();
      this.reconnectTimer = setTimeout(() => this.doConnect(), 3000);
    };

    this.ws.onerror = () => {};
  }

  sendMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date() };
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

      case 'agent': {
        const p = frame.payload;
        if (p?.stream === 'assistant' && p?.data?.delta) {
          this.appendAssistantDelta(p.data.delta);
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
              msgs.push({ role: 'assistant', content: text, timestamp: new Date() });
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
    this.typing$.next(false);
  }

  private handleResponse(frame: any): void {
    if (frame.payload?.type === 'hello-ok') {
      this.connected$.next(true);
      this.sessionKey = frame.payload?.snapshot?.sessionDefaults?.mainSessionKey || 'agent:main:main';
      const tickMs = frame.payload?.policy?.tickIntervalMs || 15000;
      this.startTick(tickMs);
    }

    if (!frame.ok && frame.error) {
      console.error('[ws] error:', frame.error.message);
    }
  }

  private sendConnect(): void {
    const id = this.nextId();
    const params: any = {
      minProtocol: 3,
      maxProtocol: 3,
      client: { id: 'openclaw-control-ui', mode: 'ui', version: '1.0.0', platform: 'web' },
      scopes: ['operator.admin', 'operator.read', 'operator.write'],
      caps: [],
    };

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
