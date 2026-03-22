import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';
import { ForgotPasswordComponent } from './forgot-password.component';

describe('ForgotPasswordComponent', () => {
  let component: ForgotPasswordComponent;
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let authService: {
    forgotPassword: jest.Mock;
    confirmNewPassword: jest.Mock;
  };
  let router: Router;

  beforeEach(async () => {
    authService = {
      forgotPassword: jest.fn(),
      confirmNewPassword: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        ForgotPasswordComponent,
        NoopAnimationsModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        { provide: AuthService, useValue: authService },
        provideRouter([]),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with codeSent=false', () => {
    expect(component.codeSent()).toBe(false);
  });

  it('should show email input in initial state', () => {
    const el: HTMLElement = fixture.nativeElement;
    const emailInput = el.querySelector('input[type="email"]');
    expect(emailInput).toBeTruthy();
  });

  it('should not show code or password inputs in initial state', () => {
    const el: HTMLElement = fixture.nativeElement;
    const inputs = el.querySelectorAll('input');
    expect(inputs.length).toBe(1);
    expect(inputs[0].type).toBe('email');
  });

  describe('sendCode', () => {
    it('should show error when email is empty', async () => {
      component.email.set('');
      await component.sendCode();

      expect(component.errorMessage()).toBe('Please enter your email');
      expect(authService.forgotPassword).not.toHaveBeenCalled();
    });

    it('should call auth.forgotPassword and set codeSent=true on success', fakeAsync(() => {
      authService.forgotPassword.mockResolvedValue(undefined);

      component.email.set('user@test.com');
      component.sendCode();
      tick();

      expect(authService.forgotPassword).toHaveBeenCalledWith('user@test.com');
      expect(component.codeSent()).toBe(true);
      expect(component.isLoading()).toBe(false);
    }));

    it('should show error message on failure', fakeAsync(() => {
      authService.forgotPassword.mockRejectedValue(new Error('User not found'));

      component.email.set('bad@test.com');
      component.sendCode();
      tick();

      expect(component.errorMessage()).toBe('User not found');
      expect(component.codeSent()).toBe(false);
      expect(component.isLoading()).toBe(false);
    }));

    it('should show generic error for non-Error exceptions', fakeAsync(() => {
      authService.forgotPassword.mockRejectedValue('unknown');

      component.email.set('user@test.com');
      component.sendCode();
      tick();

      expect(component.errorMessage()).toBe('Failed to send code');
    }));

    it('should clear previous error and success messages', fakeAsync(() => {
      authService.forgotPassword.mockResolvedValue(undefined);

      component.errorMessage.set('old error');
      component.successMessage.set('old success');
      component.email.set('user@test.com');
      component.sendCode();
      tick();

      expect(component.errorMessage()).toBe('');
      expect(component.successMessage()).toBe('');
    }));

    it('should set isLoading during request', fakeAsync(() => {
      let resolvePromise!: () => void;
      authService.forgotPassword.mockReturnValue(
        new Promise<void>(r => {
          resolvePromise = r;
        }),
      );

      component.email.set('user@test.com');
      component.sendCode();

      expect(component.isLoading()).toBe(true);

      resolvePromise();
      tick();

      expect(component.isLoading()).toBe(false);
    }));
  });

  describe('after sendCode succeeds', () => {
    beforeEach(fakeAsync(() => {
      authService.forgotPassword.mockResolvedValue(undefined);
      component.email.set('user@test.com');
      component.sendCode();
      tick();
      fixture.detectChanges();
    }));

    it('should show code and password inputs', () => {
      const el: HTMLElement = fixture.nativeElement;
      const inputs = el.querySelectorAll('input');
      expect(inputs.length).toBe(3);
      expect(inputs[0].type).toBe('text'); // verification code
      expect(inputs[1].type).toBe('password'); // new password
      expect(inputs[2].type).toBe('password'); // confirm password
    });

    it('should no longer show email input', () => {
      const el: HTMLElement = fixture.nativeElement;
      const emailInput = el.querySelector('input[type="email"]');
      expect(emailInput).toBeFalsy();
    });
  });

  describe('resetPassword', () => {
    it('should show error when code or password is empty', async () => {
      component.code.set('');
      component.newPassword.set('');
      await component.resetPassword();

      expect(component.errorMessage()).toBe('Please fill in all fields');
      expect(authService.confirmNewPassword).not.toHaveBeenCalled();
    });

    it('should show error when passwords do not match', async () => {
      component.code.set('123456');
      component.newPassword.set('newpass1');
      component.confirmPassword.set('newpass2');
      await component.resetPassword();

      expect(component.errorMessage()).toBe('Passwords do not match');
      expect(authService.confirmNewPassword).not.toHaveBeenCalled();
    });

    it('should call auth.confirmNewPassword and show success on success', fakeAsync(() => {
      authService.confirmNewPassword.mockResolvedValue(undefined);

      component.email.set('user@test.com');
      component.code.set('123456');
      component.newPassword.set('newpass');
      component.confirmPassword.set('newpass');
      component.resetPassword();
      tick();

      expect(authService.confirmNewPassword).toHaveBeenCalledWith(
        'user@test.com',
        '123456',
        'newpass',
      );
      expect(component.successMessage()).toBe(
        'Password reset successful! Redirecting...',
      );
      expect(component.isLoading()).toBe(false);

      tick(2000);
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    }));

    it('should show error message on failure', fakeAsync(() => {
      authService.confirmNewPassword.mockRejectedValue(
        new Error('Invalid verification code'),
      );

      component.email.set('user@test.com');
      component.code.set('000000');
      component.newPassword.set('newpass');
      component.confirmPassword.set('newpass');
      component.resetPassword();
      tick();

      expect(component.errorMessage()).toBe('Invalid verification code');
      expect(component.isLoading()).toBe(false);
    }));

    it('should show generic error for non-Error exceptions', fakeAsync(() => {
      authService.confirmNewPassword.mockRejectedValue('unknown');

      component.email.set('user@test.com');
      component.code.set('123456');
      component.newPassword.set('newpass');
      component.confirmPassword.set('newpass');
      component.resetPassword();
      tick();

      expect(component.errorMessage()).toBe('Password reset failed');
    }));
  });

  describe('template', () => {
    it('should render "Back to Sign In" link', () => {
      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('Back to Sign In');
    });

    it('should render error message when set', () => {
      component.errorMessage.set('Something went wrong');
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const errorDiv = el.querySelector('.error-message');
      expect(errorDiv).toBeTruthy();
      expect(errorDiv!.textContent).toContain('Something went wrong');
    });
  });
});
