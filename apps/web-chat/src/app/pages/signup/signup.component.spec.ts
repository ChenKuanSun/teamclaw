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
import { SignupComponent } from './signup.component';

describe('SignupComponent', () => {
  let component: SignupComponent;
  let fixture: ComponentFixture<SignupComponent>;
  let authService: { signUp: jest.Mock };
  let router: Router;

  beforeEach(async () => {
    authService = {
      signUp: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        SignupComponent,
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

    fixture = TestBed.createComponent(SignupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render brand name and create account title', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('TeamClaw');
    expect(el.textContent).toContain('Create Account');
  });

  it('should render email, password, and confirm password inputs', () => {
    const el: HTMLElement = fixture.nativeElement;
    const inputs = el.querySelectorAll('input');
    expect(inputs.length).toBe(3);
    expect(inputs[0].type).toBe('email');
    expect(inputs[1].type).toBe('password');
    expect(inputs[2].type).toBe('password');
  });

  it('should render sign up button', () => {
    const el: HTMLElement = fixture.nativeElement;
    const button = el.querySelector('.submit-btn');
    expect(button).toBeTruthy();
    expect(button!.textContent).toContain('Sign Up');
  });

  describe('submitSignup', () => {
    it('should show error if email or password is empty', async () => {
      component.email.set('');
      component.password.set('');
      await component.submitSignup();

      expect(component.errorMessage()).toBe('Please fill in all fields');
      expect(authService.signUp).not.toHaveBeenCalled();
    });

    it('should show error if passwords do not match', async () => {
      component.email.set('user@test.com');
      component.password.set('pass1');
      component.confirmPassword.set('pass2');
      await component.submitSignup();

      expect(component.errorMessage()).toBe('Passwords do not match');
      expect(authService.signUp).not.toHaveBeenCalled();
    });

    it('should call auth.signUp and navigate to /verify on success', fakeAsync(() => {
      authService.signUp.mockResolvedValue(undefined);

      component.email.set('user@test.com');
      component.password.set('pass123');
      component.confirmPassword.set('pass123');
      component.submitSignup();
      tick();

      expect(authService.signUp).toHaveBeenCalledWith(
        'user@test.com',
        'pass123',
      );
      expect(router.navigate).toHaveBeenCalledWith(['/verify'], {
        queryParams: { email: 'user@test.com' },
      });
      expect(component.isLoading()).toBe(false);
    }));

    it('should show error message on signup failure', fakeAsync(() => {
      authService.signUp.mockRejectedValue(new Error('User already exists'));

      component.email.set('user@test.com');
      component.password.set('pass123');
      component.confirmPassword.set('pass123');
      component.submitSignup();
      tick();

      expect(component.errorMessage()).toBe('User already exists');
      expect(component.isLoading()).toBe(false);
    }));

    it('should show generic error for non-Error exceptions', fakeAsync(() => {
      authService.signUp.mockRejectedValue('unknown');

      component.email.set('user@test.com');
      component.password.set('pass123');
      component.confirmPassword.set('pass123');
      component.submitSignup();
      tick();

      expect(component.errorMessage()).toBe('Registration failed');
    }));

    it('should set isLoading during request', fakeAsync(() => {
      let resolvePromise!: () => void;
      authService.signUp.mockReturnValue(
        new Promise<void>(r => {
          resolvePromise = r;
        }),
      );

      component.email.set('user@test.com');
      component.password.set('pass123');
      component.confirmPassword.set('pass123');
      component.submitSignup();

      expect(component.isLoading()).toBe(true);

      resolvePromise();
      tick();

      expect(component.isLoading()).toBe(false);
    }));
  });

  describe('template', () => {
    it('should render "Already have an account?" link', () => {
      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('Already have an account?');
      expect(el.textContent).toContain('Sign In');
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
