import { TestBed } from '@angular/core/testing';
import { TeamClawWsService, ChatMessage } from './teamclaw-ws.service';

// Mock WebSocket
class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = MockWebSocket.OPEN;
  send = jest.fn();
  close = jest.fn();

  constructor(public url: string) {
    // Store ref so tests can trigger events
    MockWebSocket.lastInstance = this;
  }

  static lastInstance: MockWebSocket;
}

// Assign OPEN/CLOSED to prototype so readyState checks work
Object.defineProperty(MockWebSocket, 'OPEN', { value: 1 });
Object.defineProperty(MockWebSocket, 'CLOSED', { value: 3 });

describe('TeamClawWsService', () => {
  let service: TeamClawWsService;
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    (globalThis as any).WebSocket = MockWebSocket;

    TestBed.configureTestingModule({});
    service = TestBed.inject(TeamClawWsService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    globalThis.WebSocket = originalWebSocket;
  });

  describe('connect', () => {
    it('should create WebSocket with gateway URL', () => {
      service.connect('ws://localhost:18789', 'test-token');
      expect(MockWebSocket.lastInstance.url).toBe('ws://localhost:18789');
    });

    it('should send connect frame on open', () => {
      service.connect('ws://localhost:18789', 'test-token');
      MockWebSocket.lastInstance.onopen!();

      const sentData = JSON.parse(MockWebSocket.lastInstance.send.mock.calls[0][0]);
      expect(sentData.type).toBe('request');
      expect(sentData.method).toBe('connect');
      expect(sentData.seq).toBe(1);
      expect(sentData.payload.auth.token).toBe('test-token');
      expect(sentData.payload.client.id).toBe('enterprise-chat');
      expect(sentData.payload.scopes).toEqual(['chat']);
    });

    it('should set connected$ to true on connect response', () => {
      service.connect('ws://localhost:18789', 'test-token');
      MockWebSocket.lastInstance.onopen!();

      expect(service.connected$.value).toBe(false);

      // Simulate server connect response
      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({ type: 'response', method: 'connect' }),
      });

      expect(service.connected$.value).toBe(true);
    });

    it('should load history after successful connect response', () => {
      service.connect('ws://localhost:18789', 'test-token');
      MockWebSocket.lastInstance.onopen!();

      // Clear the connect frame call
      MockWebSocket.lastInstance.send.mockClear();

      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({ type: 'response', method: 'connect' }),
      });

      const sentData = JSON.parse(MockWebSocket.lastInstance.send.mock.calls[0][0]);
      expect(sentData.method).toBe('chat.history');
    });
  });

  describe('onclose', () => {
    it('should set connected$ to false on close', () => {
      service.connect('ws://localhost:18789', 'test-token');
      MockWebSocket.lastInstance.onopen!();
      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({ type: 'response', method: 'connect' }),
      });

      expect(service.connected$.value).toBe(true);

      MockWebSocket.lastInstance.onclose!();
      expect(service.connected$.value).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('should send chat.send frame and add user message to messages$', () => {
      service.connect('ws://localhost:18789', 'test-token');
      MockWebSocket.lastInstance.onopen!();
      MockWebSocket.lastInstance.send.mockClear();

      service.sendMessage('Hello AI');

      // Check user message added
      const messages = service.messages$.value;
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello AI');

      // Check frame sent
      const sentData = JSON.parse(MockWebSocket.lastInstance.send.mock.calls[0][0]);
      expect(sentData.type).toBe('request');
      expect(sentData.method).toBe('chat.send');
      expect(sentData.payload.text).toBe('Hello AI');
      expect(sentData.payload.agentId).toBe('default');
    });

    it('should send with custom agentId', () => {
      service.connect('ws://localhost:18789', 'test-token');
      MockWebSocket.lastInstance.onopen!();
      MockWebSocket.lastInstance.send.mockClear();

      service.sendMessage('Hello', 'custom-agent');

      const sentData = JSON.parse(MockWebSocket.lastInstance.send.mock.calls[0][0]);
      expect(sentData.payload.agentId).toBe('custom-agent');
    });

    it('should not send if WebSocket is not open', () => {
      service.connect('ws://localhost:18789', 'test-token');
      MockWebSocket.lastInstance.readyState = MockWebSocket.CLOSED;
      MockWebSocket.lastInstance.send.mockClear();

      service.sendMessage('Hello');

      expect(MockWebSocket.lastInstance.send).not.toHaveBeenCalled();
    });

    it('should not send if no WebSocket connection exists', () => {
      // No connect() call, so ws is null
      expect(() => service.sendMessage('Hello')).not.toThrow();
      expect(service.messages$.value).toHaveLength(0);
    });
  });

  describe('incoming messages', () => {
    beforeEach(() => {
      service.connect('ws://localhost:18789', 'test-token');
      MockWebSocket.lastInstance.onopen!();
    });

    it('should handle chat.message event', () => {
      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({
          type: 'event',
          event: 'chat.message',
          payload: { role: 'assistant', text: 'Hi there!', timestamp: '2026-03-09T00:00:00Z' },
        }),
      });

      const msgs = service.messages$.value;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].role).toBe('assistant');
      expect(msgs[0].content).toBe('Hi there!');
    });

    it('should handle chat.message with content field', () => {
      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({
          type: 'event',
          event: 'chat.message',
          payload: { role: 'assistant', content: 'Hello via content field' },
        }),
      });

      expect(service.messages$.value[0].content).toBe('Hello via content field');
    });

    it('should set typing$ to false on chat.message', () => {
      service.typing$.next(true);

      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({
          type: 'event',
          event: 'chat.message',
          payload: { text: 'response' },
        }),
      });

      expect(service.typing$.value).toBe(false);
    });

    it('should handle chat.typing event', () => {
      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({ type: 'event', event: 'chat.typing' }),
      });

      expect(service.typing$.value).toBe(true);
    });

    it('should handle chat.history event', () => {
      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({
          type: 'event',
          event: 'chat.history',
          payload: {
            messages: [
              { role: 'user', text: 'Question', timestamp: '2026-03-09T00:00:00Z' },
              { role: 'assistant', text: 'Answer', timestamp: '2026-03-09T00:01:00Z' },
            ],
          },
        }),
      });

      const msgs = service.messages$.value;
      expect(msgs).toHaveLength(2);
      expect(msgs[0].role).toBe('user');
      expect(msgs[0].content).toBe('Question');
      expect(msgs[1].role).toBe('assistant');
      expect(msgs[1].content).toBe('Answer');
    });

    it('should handle chat.history with empty messages', () => {
      MockWebSocket.lastInstance.onmessage!({
        data: JSON.stringify({
          type: 'event',
          event: 'chat.history',
          payload: { messages: [] },
        }),
      });

      expect(service.messages$.value).toHaveLength(0);
    });
  });

  describe('disconnect', () => {
    it('should close WebSocket and set ws to null', () => {
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

  describe('loadHistory', () => {
    it('should send chat.history request with default agentId', () => {
      service.connect('ws://localhost:18789', 'test-token');
      MockWebSocket.lastInstance.onopen!();
      MockWebSocket.lastInstance.send.mockClear();

      service.loadHistory();

      const sentData = JSON.parse(MockWebSocket.lastInstance.send.mock.calls[0][0]);
      expect(sentData.method).toBe('chat.history');
      expect(sentData.payload.agentId).toBe('default');
    });

    it('should send chat.history request with custom agentId', () => {
      service.connect('ws://localhost:18789', 'test-token');
      MockWebSocket.lastInstance.onopen!();
      MockWebSocket.lastInstance.send.mockClear();

      service.loadHistory('my-agent');

      const sentData = JSON.parse(MockWebSocket.lastInstance.send.mock.calls[0][0]);
      expect(sentData.payload.agentId).toBe('my-agent');
    });
  });

  describe('sequence numbers', () => {
    it('should increment seq for each frame sent', () => {
      service.connect('ws://localhost:18789', 'test-token');
      MockWebSocket.lastInstance.onopen!();

      // First call was the connect frame (seq=1)
      const connectFrame = JSON.parse(MockWebSocket.lastInstance.send.mock.calls[0][0]);
      expect(connectFrame.seq).toBe(1);

      service.sendMessage('msg1');
      const msg1Frame = JSON.parse(MockWebSocket.lastInstance.send.mock.calls[1][0]);
      expect(msg1Frame.seq).toBe(2);

      service.sendMessage('msg2');
      const msg2Frame = JSON.parse(MockWebSocket.lastInstance.send.mock.calls[2][0]);
      expect(msg2Frame.seq).toBe(3);
    });
  });
});
