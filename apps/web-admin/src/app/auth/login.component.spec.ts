import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { AdminAuthService } from '../services/admin-auth.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authSpy: {
    login: jest.Mock;
    forgotPassword: jest.Mock;
    confirmPassword: jest.Mock;
    clearError: jest.Mock;
    isLoading: ReturnType<typeof signal>;
    error: ReturnType<typeof signal>;
    isAuthenticated: ReturnType<typeof signal>;
    accessToken: ReturnType<typeof signal>;
  };

  beforeEach(async () => {
    authSpy = {
      login: jest.fn().mockResolvedValue(true),
      forgotPassword: jest.fn().mockResolvedValue(true),
      confirmPassword: jest.fn().mockResolvedValue(true),
      clearError: jest.fn(),
      isLoading: signal(false),
      error: signal(''),
      isAuthenticated: signal(false),
      accessToken: signal(''),
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent, NoopAnimationsModule],
      providers: [{ provide: AdminAuthService, useValue: authSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start in login view', () => {
    expect(component.view).toBe('login');
  });

  describe('login()', () => {
    it('should call authService.login with email and password', async () => {
      component.email = 'admin@test.com';
      component.password = 'secret';
      await component.login();
      expect(authSpy.login).toHaveBeenCalledWith('admin@test.com', 'secret');
    });

    it('should not call login if email is empty', async () => {
      component.email = '';
      component.password = 'secret';
      await component.login();
      expect(authSpy.login).not.toHaveBeenCalled();
    });

    it('should not call login if password is empty', async () => {
      component.email = 'admin@test.com';
      component.password = '';
      await component.login();
      expect(authSpy.login).not.toHaveBeenCalled();
    });

    it('should clear password on failed login', async () => {
      authSpy.login.mockResolvedValue(false);
      component.email = 'admin@test.com';
      component.password = 'wrong';
      await component.login();
      expect(component.password).toBe('');
    });

    it('should keep password on successful login', async () => {
      component.email = 'admin@test.com';
      component.password = 'correct';
      await component.login();
      expect(component.password).toBe('correct');
    });
  });

  describe('showForgotPassword()', () => {
    it('should switch to forgot view', () => {
      component.showForgotPassword();
      expect(component.view).toBe('forgot');
    });

    it('should clear error and success message', () => {
      component.successMessage = 'some msg';
      component.showForgotPassword();
      expect(authSpy.clearError).toHaveBeenCalled();
      expect(component.successMessage).toBe('');
    });
  });

  describe('backToLogin()', () => {
    it('should switch to login view and clear fields', () => {
      component.view = 'forgot';
      component.password = 'x';
      component.resetCode = 'y';
      component.newPassword = 'z';
      component.successMessage = 'ok';
      component.backToLogin();
      expect(component.view).toBe('login');
      expect(component.password).toBe('');
      expect(component.resetCode).toBe('');
      expect(component.newPassword).toBe('');
      expect(component.successMessage).toBe('');
      expect(authSpy.clearError).toHaveBeenCalled();
    });
  });

  describe('sendResetCode()', () => {
    it('should call forgotPassword and switch to reset view on success', async () => {
      component.email = 'admin@test.com';
      await component.sendResetCode();
      expect(authSpy.forgotPassword).toHaveBeenCalledWith('admin@test.com');
      expect(component.view).toBe('reset');
    });

    it('should not call forgotPassword if email is empty', async () => {
      component.email = '';
      await component.sendResetCode();
      expect(authSpy.forgotPassword).not.toHaveBeenCalled();
    });

    it('should stay on forgot view if forgotPassword fails', async () => {
      authSpy.forgotPassword.mockResolvedValue(false);
      component.view = 'forgot';
      component.email = 'admin@test.com';
      await component.sendResetCode();
      expect(component.view).toBe('forgot');
    });
  });

  describe('resetPassword()', () => {
    it('should call confirmPassword and set success message', async () => {
      component.email = 'admin@test.com';
      component.resetCode = '123456';
      component.newPassword = 'newpass';
      await component.resetPassword();
      expect(authSpy.confirmPassword).toHaveBeenCalledWith(
        'admin@test.com',
        '123456',
        'newpass',
      );
      expect(component.successMessage).toContain('Password reset successfully');
      expect(component.resetCode).toBe('');
      expect(component.newPassword).toBe('');
    });

    it('should not call confirmPassword if resetCode is empty', async () => {
      component.resetCode = '';
      component.newPassword = 'newpass';
      await component.resetPassword();
      expect(authSpy.confirmPassword).not.toHaveBeenCalled();
    });

    it('should not call confirmPassword if newPassword is empty', async () => {
      component.resetCode = '123456';
      component.newPassword = '';
      await component.resetPassword();
      expect(authSpy.confirmPassword).not.toHaveBeenCalled();
    });

    it('should not set success message if confirmPassword fails', async () => {
      authSpy.confirmPassword.mockResolvedValue(false);
      component.email = 'admin@test.com';
      component.resetCode = '123456';
      component.newPassword = 'newpass';
      await component.resetPassword();
      expect(component.successMessage).toBe('');
    });
  });

  it('should toggle password visibility', () => {
    expect(component.hidePassword).toBe(true);
    component.hidePassword = false;
    expect(component.hidePassword).toBe(false);
  });
});
