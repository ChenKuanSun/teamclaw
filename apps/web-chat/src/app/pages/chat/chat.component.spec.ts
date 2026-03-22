import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import {
  SessionResponse,
  SessionService,
} from '../../services/session.service';
import {
  ChatMessage,
  TeamClawWsService,
} from '../../services/teamclaw-ws.service';
import { ChatComponent } from './chat.component';

describe('ChatComponent', () => {
  let component: ChatComponent;
  let fixture: ComponentFixture<ChatComponent>;
  let wsService: {
    messages$: BehaviorSubject<ChatMessage[]>;
    typing$: BehaviorSubject<boolean>;
    connected$: BehaviorSubject<boolean>;
    reconnectFailed$: BehaviorSubject<boolean>;
    connect: jest.Mock;
    sendMessage: jest.Mock;
    disconnect: jest.Mock;
    resetSession: jest.Mock;
    executeCommand: jest.Mock;
    getSessionKey: jest.Mock;
    switchSession: jest.Mock;
  };
  let authService: { getIdToken: jest.Mock };
  let sessionService: { initSession: jest.Mock };
  let router: { navigate: jest.Mock };

  beforeEach(async () => {
    wsService = {
      messages$: new BehaviorSubject<ChatMessage[]>([]),
      typing$: new BehaviorSubject<boolean>(false),
      connected$: new BehaviorSubject<boolean>(false),
      reconnectFailed$: new BehaviorSubject<boolean>(false),
      connect: jest.fn(),
      sendMessage: jest.fn(),
      disconnect: jest.fn(),
      resetSession: jest.fn(),
      executeCommand: jest.fn().mockResolvedValue({}),
      getSessionKey: jest.fn().mockReturnValue('agent:main:main'),
      switchSession: jest.fn(),
    };
    authService = {
      getIdToken: jest.fn().mockReturnValue('mock-id-token'),
    };
    sessionService = {
      initSession: jest.fn().mockReturnValue(
        of({
          status: 'ready',
          userId: 'user-1',
          gatewayUrl: 'ws://localhost:18789',
        } as SessionResponse),
      ),
    };
    router = {
      navigate: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ChatComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        { provide: TeamClawWsService, useValue: wsService },
        { provide: AuthService, useValue: authService },
        { provide: SessionService, useValue: sessionService },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { params: {} } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should call sessionService.initSession and connect to WebSocket when ready', () => {
      fixture.detectChanges();
      expect(sessionService.initSession).toHaveBeenCalled();
      expect(wsService.connect).toHaveBeenCalledWith(
        'ws://localhost:18789',
        'mock-id-token',
      );
    });

    it('should not connect if no token available', () => {
      authService.getIdToken.mockReturnValue(null);
      fixture.detectChanges();
      expect(wsService.connect).not.toHaveBeenCalled();
    });

    it('should navigate to /session if session not ready', () => {
      sessionService.initSession.mockReturnValue(
        of({
          status: 'starting',
          userId: 'user-1',
        } as SessionResponse),
      );
      fixture.detectChanges();
      expect(router.navigate).toHaveBeenCalledWith(['/session']);
    });

    it('should navigate to /session on session init error', () => {
      sessionService.initSession.mockReturnValue(
        throwError(() => new Error('fail')),
      );
      fixture.detectChanges();
      expect(router.navigate).toHaveBeenCalledWith(['/session']);
    });

    it('should subscribe to messages$', () => {
      fixture.detectChanges();
      const msgs: ChatMessage[] = [
        { role: 'user', content: 'Hello', timestamp: new Date() },
      ];
      wsService.messages$.next(msgs);
      expect(component.messages).toEqual(msgs);
    });

    it('should subscribe to typing$', () => {
      fixture.detectChanges();
      wsService.typing$.next(true);
      expect(component.typing).toBe(true);
    });

    it('should subscribe to connected$', () => {
      fixture.detectChanges();
      wsService.connected$.next(true);
      expect(component.connected).toBe(true);
    });

    it('should navigate to /session on reconnectFailed$', () => {
      fixture.detectChanges();
      wsService.reconnectFailed$.next(true);
      expect(wsService.disconnect).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/session']);
    });
  });

  describe('send', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should call sendMessage with inputText and clear input', () => {
      component.inputText = 'Hello AI';
      component.send();

      expect(wsService.sendMessage).toHaveBeenCalledWith('Hello AI');
      expect(component.inputText).toBe('');
    });

    it('should not send if inputText is empty', () => {
      component.inputText = '';
      component.send();
      expect(wsService.sendMessage).not.toHaveBeenCalled();
    });

    it('should not send if inputText is only whitespace', () => {
      component.inputText = '   ';
      component.send();
      expect(wsService.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('ngOnDestroy', () => {
    it('should unsubscribe and disconnect', () => {
      fixture.detectChanges();
      component.ngOnDestroy();
      expect(wsService.disconnect).toHaveBeenCalled();
    });

    it('should not error if subscriptions update after destroy', () => {
      fixture.detectChanges();
      component.ngOnDestroy();
      expect(() => wsService.messages$.next([])).not.toThrow();
    });
  });
});
