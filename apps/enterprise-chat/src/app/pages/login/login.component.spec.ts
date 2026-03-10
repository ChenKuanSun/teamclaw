import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { LoginComponent } from './login.component';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { CognitoUserSession } from 'amazon-cognito-identity-js';
import { signal } from '@angular/core';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: {
    login: jest.Mock;
    isAuthenticated: ReturnType<typeof signal>;
    isLoading: ReturnType<typeof signal>;
    errorMessage: ReturnType<typeof signal>;
  };
  let router: { navigate: jest.Mock };

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      isAuthenticated: signal(false),
      isLoading: signal(false),
      errorMessage: signal(''),
    };
    router = {
      navigate: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent, NoopAnimationsModule, TranslateModule.forRoot()],
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

  it('should render login card with brand name', () => {
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
    const button = el.querySelector('.submit-btn');
    expect(button).toBeTruthy();
    expect(button!.textContent).toContain('Sign In');
  });

  describe('submitLogin', () => {
    it('should call auth.login and navigate to /chat on success', fakeAsync(() => {
      authService.login.mockResolvedValue({} as CognitoUserSession);

      component.email.set('user@test.com');
      component.password.set('pass123');
      component.submitLogin();
      tick();

      expect(authService.login).toHaveBeenCalledWith('user@test.com', 'pass123');
      expect(router.navigate).toHaveBeenCalledWith(['/chat']);
    }));

    it('should show error message on login failure', fakeAsync(() => {
      authService.login.mockRejectedValue(new Error('Invalid credentials'));

      component.email.set('user@test.com');
      component.password.set('wrong');
      component.submitLogin();
      tick();

      expect(component.errorMessage()).toBe('Invalid credentials');
    }));

    it('should show validation error if email or password is empty', () => {
      component.email.set('');
      component.password.set('');
      component.submitLogin();

      expect(component.errorMessage()).toBe('Please enter email and password');
      expect(authService.login).not.toHaveBeenCalled();
    });
  });
});
