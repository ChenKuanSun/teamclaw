import { TestBed } from '@angular/core/testing';
import { TeamClawWsService } from './teamclaw-ws.service';

// Mock WebSocket
class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = MockWebSocket.OPEN;
  send = jest.fn();
  close = jest.fn();
  addEventListener = jest.fn();
  removeEventListener = jest.fn();

  constructor(public url: string) {
    MockWebSocket.lastInstance = this;
  }

  static lastInstance: MockWebSocket;
}

Object.defineProperty(MockWebSocket, 'OPEN', { value: 1 });
Object.defineProperty(MockWebSocket, 'CLOSED', { value: 3 });

describe('TeamClawWsService', () => {
  let service: TeamClawWsService;
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    // Clear sessionStorage to avoid interference from persistence
    sessionStorage.clear();

    originalWebSocket = globalThis.WebSocket;
    (globalThis as any).WebSocket = MockWebSocket;

    TestBed.configureTestingModule({});
    service = TestBed.inject(TeamClawWsService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    globalThis.WebSocket = originalWebSocket;
  });

  /** Simulate the server connect.challenge -> client connect -> server hello-ok flow */
  function doHandshake(): void {
    MockWebSocket.lastInstance.onopen!();

    // Server sends connect.challenge event
    MockWebSocket.lastInstance.onmessage!({
      data: JSON.stringify({ type: 'event', event: 'connect.challenge' }),
    });

    // Client should have sent a connect request
    const connectCall = MockWebSocket.lastInstance.send.mock.calls.find(
      (c: any) => {
        const parsed = JSON.parse(c[0]);
        return parsed.method === 'connect';
      },
    );
    expect(connectCall).toBeTruthy();

    const connectFrame = JSON.parse(connectCall[0]);

    // Server responds with hello-ok
    MockWebSocket.lastInstance.onmessage!({
      data: JSON.stringify({
        type: 'res',
        id: connectFrame.id,
        ok: true,
        payload: {
          type: 'hello-ok',
          snapshot: { sessionDefaults: { mainSessionKey: 'agent:main:main' } },
          policy: { tickIntervalMs: 15000 },
        },
      }),
    });
  }

  describe('connect', () => {
    it('should create WebSocket with gateway URL', () => {
      service.connect('ws://localhost:18789', 'test-token');
      expect(MockWebSocket.lastInstance.url).toBe('ws://localhost:18789');
    });

    it('should send connect frame after connect.challenge event', () => {
      service.connect('ws://localhost:18789', 'test-token');
      MockWebSocket.lastInstance.onopen!();

      // Server sends connect.challenge
      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({ type: 'event', event: 'connect.challenge' }),
      });

      const connectCall = MockWebSocket.lastInstance.send.mock.calls.find(
        (c: any) => {
          const parsed = JSON.parse(c[0]);
          return parsed.method === 'connect';
        },
      );
      expect(connectCall).toBeTruthy();
      const sentData = JSON.parse(connectCall[0]);
      expect(sentData.type).toBe('req');
      expect(sentData.method).toBe('connect');
      expect(sentData.params.client.id).toBe('openclaw-control-ui');
    });

    it('should set connected$ to true on hello-ok response', () => {
      service.connect('ws://localhost:18789', 'test-token');
      expect(service.connected$.value).toBe(false);

      doHandshake();

      expect(service.connected$.value).toBe(true);
    });

    it('should load history after successful connect response', () => {
      service.connect('ws://localhost:18789', 'test-token');
      MockWebSocket.lastInstance.send.mockClear();

      doHandshake();

      // After hello-ok, service should send sessions.preview request
      const historyCall = MockWebSocket.lastInstance.send.mock.calls.find(
        (c: any) => {
          const parsed = JSON.parse(c[0]);
          return parsed.method === 'sessions.preview';
        },
      );
      expect(historyCall).toBeTruthy();
    });
  });

  describe('onclose', () => {
    it('should set connected$ to false on close', () => {
      service.connect('ws://localhost:18789', 'test-token');
      doHandshake();

      expect(service.connected$.value).toBe(true);

      MockWebSocket.lastInstance.onclose!({ code: 1000, reason: '' });
      expect(service.connected$.value).toBe(false);
    });

    it('should set reconnectFailed$ on auth failure close code', () => {
      service.connect('ws://localhost:18789', 'test-token');
      doHandshake();

      MockWebSocket.lastInstance.onclose!({
        code: 1008,
        reason: 'auth failure',
      });
      expect(service.reconnectFailed$.value).toBe(true);
    });
  });

  describe('sendMessage', () => {
    it('should send chat.send frame and add user message to messages$', () => {
      service.connect('ws://localhost:18789', 'test-token');
      doHandshake();
      MockWebSocket.lastInstance.send.mockClear();

      service.sendMessage('Hello AI');

      // Check user message added
      const messages = service.messages$.value;
      expect(messages.length).toBeGreaterThanOrEqual(1);
      const lastUserMsg = messages.find(
        m => m.role === 'user' && m.content === 'Hello AI',
      );
      expect(lastUserMsg).toBeTruthy();

      // Check frame sent
      const sendCall = MockWebSocket.lastInstance.send.mock.calls.find(
        (c: any) => {
          const parsed = JSON.parse(c[0]);
          return parsed.method === 'chat.send';
        },
      );
      expect(sendCall).toBeTruthy();
      const sentData = JSON.parse(sendCall[0]);
      expect(sentData.type).toBe('req');
      expect(sentData.method).toBe('chat.send');
      expect(sentData.params.message).toBe('Hello AI');
      expect(sentData.params.sessionKey).toBeDefined();
    });

    it('should not send if WebSocket is not open', () => {
      service.connect('ws://localhost:18789', 'test-token');
      MockWebSocket.lastInstance.readyState = MockWebSocket.CLOSED;
      MockWebSocket.lastInstance.send.mockClear();

      service.sendMessage('Hello');

      expect(MockWebSocket.lastInstance.send).not.toHaveBeenCalled();
    });

    it('should not send if no WebSocket connection exists', () => {
      expect(() => service.sendMessage('Hello')).not.toThrow();
    });
  });

  describe('incoming events', () => {
    beforeEach(() => {
      service.connect('ws://localhost:18789', 'test-token');
      doHandshake();
    });

    it('should handle agent stream delta', () => {
      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({
          type: 'event',
          event: 'agent',
          payload: { stream: 'assistant', data: { delta: 'Hi there!' } },
        }),
      });

      const msgs = service.messages$.value;
      const assistantMsg = msgs.find(m => m.role === 'assistant');
      expect(assistantMsg).toBeTruthy();
      expect(assistantMsg!.content).toContain('Hi there!');
    });

    it('should handle agent lifecycle start event', () => {
      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({
          type: 'event',
          event: 'agent',
          payload: {
            stream: 'lifecycle',
            data: { phase: 'start' },
            runId: 'run-1',
          },
        }),
      });

      expect(service.typing$.value).toBe(true);
    });

    it('should handle agent lifecycle end event', () => {
      // Start first
      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({
          type: 'event',
          event: 'agent',
          payload: {
            stream: 'lifecycle',
            data: { phase: 'start' },
            runId: 'run-1',
          },
        }),
      });
      expect(service.typing$.value).toBe(true);

      // End
      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({
          type: 'event',
          event: 'agent',
          payload: {
            stream: 'lifecycle',
            data: { phase: 'end' },
            runId: 'run-1',
          },
        }),
      });
      expect(service.typing$.value).toBe(false);
    });

    it('should handle chat event with final state', () => {
      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({
          type: 'event',
          event: 'chat',
          payload: {
            state: 'final',
            message: {
              content: [{ type: 'text', text: 'Final answer' }],
            },
          },
        }),
      });

      const msgs = service.messages$.value;
      const assistantMsg = msgs.find(
        m => m.role === 'assistant' && m.content === 'Final answer',
      );
      expect(assistantMsg).toBeTruthy();
      expect(service.typing$.value).toBe(false);
    });

    it('should handle chat.typing event', () => {
      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({ type: 'event', event: 'chat.typing' }),
      });

      expect(service.typing$.value).toBe(true);
    });

    it('should handle chat.typing.stop event', () => {
      service.typing$.next(true);
      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({ type: 'event', event: 'chat.typing.stop' }),
      });

      expect(service.typing$.value).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should close WebSocket', () => {
      service.connect('ws://localhost:18789', 'test-token');
      const wsInstance = MockWebSocket.lastInstance;

      service.disconnect();

      expect(wsInstance.close).toHaveBeenCalled();
    });

    it('should handle disconnect when not connected', () => {
      expect(() => service.disconnect()).not.toThrow();
    });
  });

  describe('ngOnDestroy', () => {
    it('should call disconnect', () => {
      service.connect('ws://localhost:18789', 'test-token');
      const wsInstance = MockWebSocket.lastInstance;

      service.ngOnDestroy();

      expect(wsInstance.close).toHaveBeenCalled();
    });
  });

  describe('sequence ids', () => {
    it('should generate unique ids for each request', () => {
      service.connect('ws://localhost:18789', 'test-token');
      doHandshake();
      MockWebSocket.lastInstance.send.mockClear();

      service.sendMessage('msg1');
      service.sendMessage('msg2');

      const ids = MockWebSocket.lastInstance.send.mock.calls.map((c: any) => {
        return JSON.parse(c[0]).id;
      });
      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});
