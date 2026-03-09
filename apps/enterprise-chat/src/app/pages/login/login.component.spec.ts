import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { LoginComponent } from './login.component';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { CognitoUserSession } from 'amazon-cognito-identity-js';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: jest.Mocked<Pick<AuthService, 'login'>>;
  let router: jest.Mocked<Pick<Router, 'navigate'>>;

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
    };
    router = {
      navigate: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent, NoopAnimationsModule],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty fields and no error', () => {
    expect(component.email).toBe('');
    expect(component.password).toBe('');
    expect(component.error).toBe('');
    expect(component.loading).toBe(false);
  });

  it('should render login card with title', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('TeamClaw');
  });

  it('should render email and password inputs', () => {
    const el: HTMLElement = fixture.nativeElement;
    const inputs = el.querySelectorAll('input');
    expect(inputs.length).toBe(2);
    expect(inputs[0].type).toBe('email');
    expect(inputs[1].type).toBe('password');
  });

  it('should render sign in button', () => {
    const el: HTMLElement = fixture.nativeElement;
    const button = el.querySelector('button');
    expect(button).toBeTruthy();
    expect(button!.textContent).toContain('Sign In');
  });

  describe('login', () => {
    it('should call auth.login and navigate to /chat on success', fakeAsync(() => {
      authService.login.mockResolvedValue({} as CognitoUserSession);

      component.email = 'user@test.com';
      component.password = 'pass123';
      component.login();

      expect(component.loading).toBe(true);
      tick();

      expect(authService.login).toHaveBeenCalledWith('user@test.com', 'pass123');
      expect(router.navigate).toHaveBeenCalledWith(['/chat']);
      expect(component.loading).toBe(false);
      expect(component.error).toBe('');
    }));

    it('should show error message on login failure with Error', fakeAsync(() => {
      authService.login.mockRejectedValue(new Error('Invalid credentials'));

      component.email = 'user@test.com';
      component.password = 'wrong';
      component.login();
      tick();

      expect(component.error).toBe('Invalid credentials');
      expect(component.loading).toBe(false);
      expect(router.navigate).not.toHaveBeenCalled();
    }));

    it('should show generic error on non-Error rejection', fakeAsync(() => {
      authService.login.mockRejectedValue('something unexpected');

      component.login();
      tick();

      expect(component.error).toBe('Login failed');
      expect(component.loading).toBe(false);
    }));

    it('should display loading text on button while signing in', fakeAsync(() => {
      let resolveLogin: (v: CognitoUserSession) => void;
      authService.login.mockReturnValue(
        new Promise((resolve) => {
          resolveLogin = resolve;
        })
      );

      component.login();
      fixture.detectChanges();

      const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
      expect(button.textContent).toContain('Signing in...');
      expect(button.disabled).toBe(true);

      resolveLogin!({} as CognitoUserSession);
      tick();
      fixture.detectChanges();

      expect(button.textContent).toContain('Sign In');
      expect(button.disabled).toBe(false);
    }));

    it('should display error div when error is set', fakeAsync(() => {
      authService.login.mockRejectedValue(new Error('Bad request'));

      component.login();
      tick();
      fixture.detectChanges();

      const errorDiv = fixture.nativeElement.querySelector('.error');
      expect(errorDiv).toBeTruthy();
      expect(errorDiv.textContent).toContain('Bad request');
    }));

    it('should not display error div when no error', () => {
      const errorDiv = fixture.nativeElement.querySelector('.error');
      expect(errorDiv).toBeFalsy();
    });
  });
});
