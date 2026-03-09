import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { LayoutComponent } from './layout.component';
import { AdminAuthService } from '../services/admin-auth.service';
import { signal } from '@angular/core';

describe('LayoutComponent', () => {
  let component: LayoutComponent;
  let fixture: ComponentFixture<LayoutComponent>;

  const mockAuthService = {
    userEmail: signal('admin@test.com'),
    signOut: jest.fn(),
    isAuthenticated: signal(true),
    accessToken: signal('mock-token'),
    idToken: signal('mock-id'),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayoutComponent, NoopAnimationsModule, RouterModule.forRoot([])],
      providers: [
        { provide: AdminAuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should determine sidenav mode based on device size', () => {
    // Default window width in test env should determine mode
    const mode = component.sidenavMode();
    expect(['side', 'over']).toContain(mode);
  });

  it('should toggle sidenav', () => {
    // Verify toggleSidenav method exists and can be called
    expect(() => component.toggleSidenav()).not.toThrow();
  });

  it('should render header and sidenav child components', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('tc-admin-header')).toBeTruthy();
    expect(compiled.querySelector('tc-admin-side-nav')).toBeTruthy();
  });

  it('should set isSmallDevice based on window width', () => {
    // In jsdom, window.innerWidth defaults to something
    // We test that onResize updates the signal
    Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
    component.onResize();
    expect(component.isSmallDevice()).toBe(true);

    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    component.onResize();
    expect(component.isSmallDevice()).toBe(false);
  });

  it('should compute sidenavOpened as inverse of isSmallDevice', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    component.onResize();
    expect(component.sidenavOpened()).toBe(true);

    Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
    component.onResize();
    expect(component.sidenavOpened()).toBe(false);
  });
});
