import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';
import { VerifyComponent } from './verify.component';

describe('VerifyComponent', () => {
  let component: VerifyComponent;
  let fixture: ComponentFixture<VerifyComponent>;
  let authService: { confirmRegistration: jest.Mock };
  let router: { navigate: jest.Mock };

  function setup(queryParams: Record<string, string> = {}) {
    authService = {
      confirmRegistration: jest.fn(),
    };

    router = { navigate: jest.fn().mockResolvedValue(true) };

    const mockActivatedRoute = {
      snapshot: {
        queryParamMap: {
          get: (key: string) => queryParams[key] || null,
        },
      },
    };

    TestBed.configureTestingModule({
      imports: [
        VerifyComponent,
        NoopAnimationsModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VerifyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should create', () => {
    setup();
    expect(component).toBeTruthy();
  });

  it('should read email from query params on init', () => {
    setup({ email: 'user@test.com' });
    expect(component.email()).toBe('user@test.com');
  });

  it('should handle missing email query param', () => {
    setup();
    expect(component.email()).toBe('');
  });

  it('should render brand name and verify title', () => {
    setup({ email: 'user@test.com' });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('TeamClaw');
    expect(el.textContent).toContain('Verify Email');
  });

  it('should show email in hint text', () => {
    setup({ email: 'user@test.com' });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('user@test.com');
  });

  it('should render verification code input', () => {
    setup();
    const el: HTMLElement = fixture.nativeElement;
    const inputs = el.querySelectorAll('input');
    expect(inputs.length).toBe(1);
  });

  describe('submitVerify', () => {
    it('should show error when code is empty', async () => {
      setup({ email: 'user@test.com' });
      component.code.set('');
      await component.submitVerify();

      expect(component.errorMessage()).toBe(
        'Please enter the verification code',
      );
      expect(authService.confirmRegistration).not.toHaveBeenCalled();
    });

    it('should call auth.confirmRegistration and set success on success', fakeAsync(() => {
      setup({ email: 'user@test.com' });
      authService.confirmRegistration.mockResolvedValue(undefined);

      component.code.set('123456');
      component.submitVerify();
      tick();

      expect(authService.confirmRegistration).toHaveBeenCalledWith(
        'user@test.com',
        '123456',
      );
      expect(component.success()).toBe(true);
      expect(component.isLoading()).toBe(false);

      tick(2000);
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    }));

    it('should show error message on failure', fakeAsync(() => {
      setup({ email: 'user@test.com' });
      authService.confirmRegistration.mockRejectedValue(
        new Error('Invalid code'),
      );

      component.code.set('000000');
      component.submitVerify();
      tick();

      expect(component.errorMessage()).toBe('Invalid code');
      expect(component.success()).toBe(false);
      expect(component.isLoading()).toBe(false);
    }));

    it('should show generic error for non-Error exceptions', fakeAsync(() => {
      setup({ email: 'user@test.com' });
      authService.confirmRegistration.mockRejectedValue('unknown');

      component.code.set('123456');
      component.submitVerify();
      tick();

      expect(component.errorMessage()).toBe('Verification failed');
    }));

    it('should set isLoading during request', fakeAsync(() => {
      setup({ email: 'user@test.com' });
      let resolvePromise!: () => void;
      authService.confirmRegistration.mockReturnValue(
        new Promise<void>(r => {
          resolvePromise = r;
        }),
      );

      component.code.set('123456');
      component.submitVerify();

      expect(component.isLoading()).toBe(true);

      resolvePromise();
      tick();

      expect(component.isLoading()).toBe(false);

      // Clean up the setTimeout
      tick(2000);
    }));
  });

  describe('template', () => {
    it('should render "Back to Sign In" link', () => {
      setup();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('Back to Sign In');
    });

    it('should show success message when verified', fakeAsync(() => {
      setup({ email: 'user@test.com' });
      authService.confirmRegistration.mockResolvedValue(undefined);

      component.code.set('123456');
      component.submitVerify();
      tick();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const successDiv = el.querySelector('.success-message');
      expect(successDiv).toBeTruthy();
      expect(successDiv!.textContent).toContain('Email verified');

      tick(2000);
    }));

    it('should render error message when set', () => {
      setup();
      component.errorMessage.set('Something went wrong');
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const errorDiv = el.querySelector('.error-message');
      expect(errorDiv).toBeTruthy();
      expect(errorDiv!.textContent).toContain('Something went wrong');
    });
  });
});
