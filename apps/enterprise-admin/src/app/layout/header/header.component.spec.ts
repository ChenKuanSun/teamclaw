import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { HeaderComponent } from './header.component';
import { AdminAuthService } from '../../services/admin-auth.service';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let authServiceMock: { userEmail: ReturnType<typeof signal>; signOut: jest.Mock };

  beforeEach(async () => {
    authServiceMock = {
      userEmail: signal('admin@teamclaw.com'),
      signOut: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [HeaderComponent, NoopAnimationsModule],
      providers: [
        { provide: AdminAuthService, useValue: authServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display header title', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('TeamClaw Admin');
  });

  it('should show user email from auth service', () => {
    expect(component.userEmail()).toBe('admin@teamclaw.com');
  });

  it('should emit menuToggle when onMenuToggle is called', () => {
    const spy = jest.fn();
    component.menuToggle.subscribe(spy);
    component.onMenuToggle();
    expect(spy).toHaveBeenCalled();
  });

  it('should call authService.signOut on sign out', () => {
    component.signOut();
    expect(authServiceMock.signOut).toHaveBeenCalled();
  });

  it('should not show menu button by default', () => {
    expect(component.showMenuButton()).toBe(false);
  });
});
