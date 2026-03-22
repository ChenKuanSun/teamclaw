import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../services/auth.service';
import { HeaderComponent } from './header.component';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let authSpy: {
    signOut: jest.Mock;
    isAuthenticated: ReturnType<typeof signal>;
    user: ReturnType<typeof signal>;
    isLoading: ReturnType<typeof signal>;
    errorMessage: ReturnType<typeof signal>;
  };
  let routerSpy: { url: string; navigate: jest.Mock };

  beforeEach(async () => {
    authSpy = {
      signOut: jest.fn(),
      isAuthenticated: signal(true),
      user: signal(null),
      isLoading: signal(false),
      errorMessage: signal(''),
    };
    routerSpy = { url: '/chat', navigate: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [
        HeaderComponent,
        NoopAnimationsModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        { provide: AuthService, useValue: authSpy },
        { provide: Router, useValue: routerSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { params: {} } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('currentPageLabel', () => {
    it('should capitalize current route', () => {
      expect(component.currentPageLabel()).toBe('Chat');
    });
  });

  describe('signOut()', () => {
    it('should call authService.signOut', () => {
      component.signOut();
      expect(authSpy.signOut).toHaveBeenCalled();
    });
  });
});
