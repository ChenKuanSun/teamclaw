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
  private seq = 0;

  readonly messages$ = new BehaviorSubject<ChatMessage[]>([]);
  readonly connected$ = new BehaviorSubject<boolean>(false);
  readonly typing$ = new BehaviorSubject<boolean>(false);

  connect(gatewayUrl: string, token: string): void {
    this.ws = new WebSocket(gatewayUrl);

    this.ws.onopen = () => {
      this.sendFrame({
        type: 'request',
        method: 'connect',
        seq: this.nextSeq(),
        payload: {
          minProtocol: 1,
          maxProtocol: 1,
          client: { id: 'enterprise-chat', version: '1.0.0', platform: 'web' },
          role: 'user',
          scopes: ['chat'],
          auth: { token },
        },
      });
    };

    this.ws.onmessage = (event) => {
      const frame = JSON.parse(event.data);
      this.handleFrame(frame);
    };

    this.ws.onclose = () => {
      this.connected$.next(false);
    };
  }

  sendMessage(text: string, agentId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date() };
    this.messages$.next([...this.messages$.value, userMsg]);

    this.sendFrame({
      type: 'request',
      method: 'chat.send',
      seq: this.nextSeq(),
      payload: { text, agentId: agentId || 'default' },
    });
  }

  loadHistory(agentId?: string): void {
    this.sendFrame({
      type: 'request',
      method: 'chat.history',
      seq: this.nextSeq(),
      payload: { agentId: agentId || 'default' },
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private handleFrame(frame: any): void {
    if (frame.type === 'response' && frame.method === 'connect') {
      this.connected$.next(true);
      this.loadHistory();
    }

    if (frame.type === 'event') {
      switch (frame.event) {
        case 'chat.message': {
          const msg: ChatMessage = {
            role: frame.payload.role || 'assistant',
            content: frame.payload.text || frame.payload.content || '',
            timestamp: new Date(frame.payload.timestamp || Date.now()),
          };
          this.messages$.next([...this.messages$.value, msg]);
          this.typing$.next(false);
          break;
        }
        case 'chat.typing':
          this.typing$.next(true);
          break;
        case 'chat.history': {
          const history = (frame.payload.messages || []).map((m: any) => ({
            role: m.role,
            content: m.text || m.content || '',
            timestamp: new Date(m.timestamp || Date.now()),
          }));
          this.messages$.next(history);
          break;
        }
      }
    }
  }

  private sendFrame(frame: any): void {
    this.ws?.send(JSON.stringify(frame));
  }

  private nextSeq(): number {
    return ++this.seq;
  }
}
