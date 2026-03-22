import { HttpErrorResponse } from '@angular/common/http';
import {
  ComponentFixture,
  TestBed,
  discardPeriodicTasks,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import {
  SessionResponse,
  SessionService,
} from '../../services/session.service';
import { SessionInitComponent } from './session-init.component';

describe('SessionInitComponent', () => {
  let component: SessionInitComponent;
  let fixture: ComponentFixture<SessionInitComponent>;
  let sessionService: { initSession: jest.Mock };
  let router: Router;

  beforeEach(async () => {
    sessionService = {
      initSession: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        SessionInitComponent,
        NoopAnimationsModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        { provide: SessionService, useValue: sessionService },
        provideRouter([]),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    jest.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(SessionInitComponent);
    component = fixture.componentInstance;
  }

  it('should create', () => {
    sessionService.initSession.mockReturnValue(
      of({ status: 'starting', userId: 'u1' } as SessionResponse),
    );
    createComponent();
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should show spinner and "Connecting..." message initially', () => {
    sessionService.initSession.mockReturnValue(
      of({ status: 'starting', userId: 'u1' } as SessionResponse),
    );
    createComponent();
    // Before detectChanges, check default signal
    expect(component.statusMessage()).toBe('Connecting...');
    expect(component.error()).toBe('');
  });

  it('should call sessionService.initSession() on init', () => {
    sessionService.initSession.mockReturnValue(
      of({ status: 'starting', userId: 'u1' } as SessionResponse),
    );
    createComponent();
    fixture.detectChanges();
    expect(sessionService.initSession).toHaveBeenCalled();
  });

  it('should navigate to /chat with gatewayUrl on "ready" response', fakeAsync(() => {
    sessionService.initSession.mockReturnValue(
      of({
        status: 'ready',
        userId: 'u1',
        gatewayUrl: 'wss://example.com',
      } as SessionResponse),
    );
    createComponent();
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/chat'], {
      queryParams: { gw: 'wss://example.com' },
    });
  }));

  it('should navigate to /chat with empty queryParams when gatewayUrl is absent', fakeAsync(() => {
    sessionService.initSession.mockReturnValue(
      of({ status: 'ready', userId: 'u1' } as SessionResponse),
    );
    createComponent();
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/chat'], {
      queryParams: {},
    });
  }));

  it('should show provisioning message and start polling on "provisioning" response', fakeAsync(() => {
    sessionService.initSession.mockReturnValue(
      of({
        status: 'provisioning',
        userId: 'u1',
        message: 'Setting up your workspace...',
      } as SessionResponse),
    );
    createComponent();
    fixture.detectChanges();

    expect(component.statusMessage()).toBe('Setting up your workspace...');
    expect(component.error()).toBe('');

    discardPeriodicTasks();
  }));

  it('should show starting message on "starting" response', fakeAsync(() => {
    sessionService.initSession.mockReturnValue(
      of({ status: 'starting', userId: 'u1' } as SessionResponse),
    );
    createComponent();
    fixture.detectChanges();

    expect(component.statusMessage()).toBe('Starting your assistant...');

    discardPeriodicTasks();
  }));

  it('should poll every 3 seconds', fakeAsync(() => {
    let callCount = 0;
    sessionService.initSession.mockImplementation(() => {
      callCount++;
      if (callCount >= 3) {
        return of({
          status: 'ready',
          userId: 'u1',
          gatewayUrl: 'wss://gw.com',
        } as SessionResponse);
      }
      return of({ status: 'starting', userId: 'u1' } as SessionResponse);
    });

    createComponent();
    fixture.detectChanges();

    // First call happens immediately in ngOnInit
    expect(sessionService.initSession).toHaveBeenCalledTimes(1);

    tick(3000); // Second poll
    expect(sessionService.initSession).toHaveBeenCalledTimes(2);

    tick(3000); // Third poll — returns 'ready'
    expect(sessionService.initSession).toHaveBeenCalledTimes(3);
    expect(router.navigate).toHaveBeenCalledWith(['/chat'], {
      queryParams: { gw: 'wss://gw.com' },
    });
  }));

  it('should stop and show timeout error after 60 polls', fakeAsync(() => {
    sessionService.initSession.mockReturnValue(
      of({ status: 'starting', userId: 'u1' } as SessionResponse),
    );
    createComponent();
    fixture.detectChanges();

    // First poll happened in ngOnInit (pollCount = 1), starts interval
    // Remaining 59 polls via interval
    for (let i = 0; i < 59; i++) {
      tick(3000);
    }

    // pollCount is now 60, next tick should trigger the 61st call which exceeds MAX_POLLS
    tick(3000);

    expect(component.error()).toBe(
      'Timed out waiting for your workspace. Please try again.',
    );
    expect(router.navigate).not.toHaveBeenCalled();
  }));

  it('should show domain not authorized message on 403 error', fakeAsync(() => {
    sessionService.initSession.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: { message: 'Domain not allowed' },
          }),
      ),
    );
    createComponent();
    fixture.detectChanges();

    expect(component.error()).toBe('Domain not allowed');
  }));

  it('should show default 403 message when no error message in response', fakeAsync(() => {
    sessionService.initSession.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: {},
          }),
      ),
    );
    createComponent();
    fixture.detectChanges();

    expect(component.error()).toBe(
      'Your email domain is not authorized. Please contact your IT administrator.',
    );
  }));

  it('should show generic error on non-403 errors', fakeAsync(() => {
    sessionService.initSession.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 500,
            error: { message: 'Internal Server Error' },
          }),
      ),
    );
    createComponent();
    fixture.detectChanges();

    expect(component.error()).toBe('Unable to connect. Please try again.');
  }));

  it('should render error template with retry button when error is set', fakeAsync(() => {
    sessionService.initSession.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    createComponent();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Access Denied');
    expect(el.textContent).toContain('Retry');
  }));

  it('should reset poll count and restart on retry', fakeAsync(() => {
    sessionService.initSession.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    createComponent();
    fixture.detectChanges();

    // Now make it succeed on retry
    sessionService.initSession.mockReturnValue(
      of({
        status: 'ready',
        userId: 'u1',
        gatewayUrl: 'wss://gw.com',
      } as SessionResponse),
    );

    component.retry();

    expect(sessionService.initSession).toHaveBeenCalledTimes(2);
    expect(router.navigate).toHaveBeenCalledWith(['/chat'], {
      queryParams: { gw: 'wss://gw.com' },
    });
  }));

  it('should render spinner when no error', fakeAsync(() => {
    sessionService.initSession.mockReturnValue(
      of({ status: 'starting', userId: 'u1' } as SessionResponse),
    );
    createComponent();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('mat-progress-spinner')).toBeTruthy();

    discardPeriodicTasks();
  }));

  it('should clean up polling on destroy', fakeAsync(() => {
    sessionService.initSession.mockReturnValue(
      of({ status: 'starting', userId: 'u1' } as SessionResponse),
    );
    createComponent();
    fixture.detectChanges();

    const callsBefore = sessionService.initSession.mock.calls.length;

    component.ngOnDestroy();

    tick(6000);
    expect(sessionService.initSession).toHaveBeenCalledTimes(callsBefore);
  }));
});
