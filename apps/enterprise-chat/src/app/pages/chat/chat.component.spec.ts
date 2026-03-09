import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatComponent } from './chat.component';
import { TeamClawWsService, ChatMessage } from '../../services/teamclaw-ws.service';
import { AuthService } from '../../services/auth.service';
import { BehaviorSubject } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('ChatComponent', () => {
  let component: ChatComponent;
  let fixture: ComponentFixture<ChatComponent>;
  let wsService: {
    messages$: BehaviorSubject<ChatMessage[]>;
    typing$: BehaviorSubject<boolean>;
    connected$: BehaviorSubject<boolean>;
    connect: jest.Mock;
    sendMessage: jest.Mock;
    disconnect: jest.Mock;
    loadHistory: jest.Mock;
  };
  let authService: { getIdToken: jest.Mock };

  beforeEach(async () => {
    wsService = {
      messages$: new BehaviorSubject<ChatMessage[]>([]),
      typing$: new BehaviorSubject<boolean>(false),
      connected$: new BehaviorSubject<boolean>(false),
      connect: jest.fn(),
      sendMessage: jest.fn(),
      disconnect: jest.fn(),
      loadHistory: jest.fn(),
    };
    authService = {
      getIdToken: jest.fn().mockReturnValue('mock-id-token'),
    };

    await TestBed.configureTestingModule({
      imports: [ChatComponent, NoopAnimationsModule],
      providers: [
        { provide: TeamClawWsService, useValue: wsService },
        { provide: AuthService, useValue: authService },
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
    it('should connect to WebSocket with token on init', () => {
      fixture.detectChanges();
      expect(wsService.connect).toHaveBeenCalledWith('ws://localhost:18789', 'mock-id-token');
    });

    it('should not connect if no token available', () => {
      authService.getIdToken.mockReturnValue(null);
      fixture.detectChanges();
      expect(wsService.connect).not.toHaveBeenCalled();
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
  });

  describe('UI rendering', () => {
    it('should show TeamClaw in header', () => {
      fixture.detectChanges();
      const header = fixture.nativeElement.querySelector('.chat-header h2');
      expect(header.textContent).toContain('TeamClaw');
    });

    it('should show Disconnected status initially', () => {
      fixture.detectChanges();
      const status = fixture.nativeElement.querySelector('.status');
      expect(status.textContent).toContain('Disconnected');
      expect(status.classList.contains('connected')).toBe(false);
    });

    it('should show Connected status when connected', () => {
      fixture.detectChanges();
      wsService.connected$.next(true);
      fixture.detectChanges();

      const status = fixture.nativeElement.querySelector('.status');
      expect(status.textContent).toContain('Connected');
      expect(status.classList.contains('connected')).toBe(true);
    });

    it('should render chat messages', () => {
      fixture.detectChanges();
      wsService.messages$.next([
        { role: 'user', content: 'Hello', timestamp: new Date() },
        { role: 'assistant', content: 'Hi!', timestamp: new Date() },
      ]);
      fixture.detectChanges();

      const msgs = fixture.nativeElement.querySelectorAll('.message');
      expect(msgs.length).toBe(2);
      expect(msgs[0].textContent).toContain('You');
      expect(msgs[0].textContent).toContain('Hello');
      expect(msgs[1].textContent).toContain('AI');
      expect(msgs[1].textContent).toContain('Hi!');
    });

    it('should show typing indicator when typing$ is true', () => {
      fixture.detectChanges();
      wsService.typing$.next(true);
      fixture.detectChanges();

      const typingEl = fixture.nativeElement.querySelector('.typing');
      expect(typingEl).toBeTruthy();
      expect(typingEl.textContent).toContain('...');
    });

    it('should not show typing indicator when typing$ is false', () => {
      fixture.detectChanges();
      const typingEl = fixture.nativeElement.querySelector('.typing');
      expect(typingEl).toBeFalsy();
    });

    it('should apply user class on user messages', () => {
      fixture.detectChanges();
      wsService.messages$.next([
        { role: 'user', content: 'Hello', timestamp: new Date() },
      ]);
      fixture.detectChanges();

      const msg = fixture.nativeElement.querySelector('.message.user');
      expect(msg).toBeTruthy();
    });

    it('should apply assistant class on assistant messages', () => {
      fixture.detectChanges();
      wsService.messages$.next([
        { role: 'assistant', content: 'Hello', timestamp: new Date() },
      ]);
      fixture.detectChanges();

      const msg = fixture.nativeElement.querySelector('.message.assistant');
      expect(msg).toBeTruthy();
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

    it('should disable send button when input is empty', () => {
      component.inputText = '';
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('button[mat-fab]');
      expect(button.disabled).toBe(true);
    });
  });

  describe('scrollToBottom', () => {
    it('should scroll message list to bottom after view checked', () => {
      fixture.detectChanges();

      // The messageList ViewChild is the .chat-messages div
      const messageListEl = fixture.nativeElement.querySelector('.chat-messages');
      Object.defineProperty(messageListEl, 'scrollHeight', { value: 500, configurable: true });

      component.ngAfterViewChecked();

      expect(messageListEl.scrollTop).toBe(500);
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

      // Updating observables after destroy should not throw
      expect(() => wsService.messages$.next([])).not.toThrow();
    });
  });
});
