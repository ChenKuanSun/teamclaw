import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';
import { UserDetailComponent } from './user-detail.component';
import {
  AdminApiService,
  AdminUser,
  Container,
} from '../../services/admin-api.service';

describe('UserDetailComponent', () => {
  let component: UserDetailComponent;
  let fixture: ComponentFixture<UserDetailComponent>;
  let apiSpy: jest.Mocked<Pick<AdminApiService, 'getUser' | 'getContainer' | 'startContainer' | 'stopContainer' | 'provisionContainer'>>;
  let locationSpy: jest.Mocked<Pick<Location, 'back'>>;

  const mockUser: AdminUser = {
    userId: 'user-123',
    email: 'test@example.com',
    displayName: 'Test User',
    teamId: 'team-1',
    status: 'running',
    createdAt: '2025-01-01',
    lastActiveAt: '2025-03-01',
  };

  const mockContainer: Container = {
    userId: 'user-123',
    status: 'running',
    taskArn: 'arn:aws:ecs:task/abc123',
    startedAt: '2025-03-01T10:00:00Z',
  };

  beforeEach(async () => {
    apiSpy = {
      getUser: jest.fn().mockReturnValue(of(mockUser)),
      getContainer: jest.fn().mockReturnValue(of(mockContainer)),
      startContainer: jest.fn().mockReturnValue(of({ ...mockContainer, status: 'running' })),
      stopContainer: jest.fn().mockReturnValue(of({ ...mockContainer, status: 'stopped' })),
      provisionContainer: jest.fn().mockReturnValue(of({ ...mockContainer, status: 'provisioned' })),
    };

    locationSpy = { back: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [UserDetailComponent, NoopAnimationsModule],
      providers: [
        { provide: AdminApiService, useValue: apiSpy },
        { provide: Location, useValue: locationSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: (key: string) => 'user-123' } },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should load user by route param ID', () => {
    expect(apiSpy.getUser).toHaveBeenCalledWith('user-123');
    expect(component.user()).toEqual(mockUser);
  });

  it('should show user info fields', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('test@example.com');
    expect(compiled.textContent).toContain('user-123');
    expect(compiled.textContent).toContain('Test User');
    expect(compiled.textContent).toContain('team-1');
  });

  it('should load container data', () => {
    expect(apiSpy.getContainer).toHaveBeenCalledWith('user-123');
    expect(component.container()).toEqual(mockContainer);
  });

  it('should show container status badge', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const badge = compiled.querySelector('.status-badge');
    expect(badge).toBeTruthy();
    expect(badge?.textContent?.trim()).toBe('running');
  });

  it('should call startContainer API on start button click', () => {
    component.startContainer();
    expect(apiSpy.startContainer).toHaveBeenCalledWith('user-123');
  });

  it('should call stopContainer API on stop button click', () => {
    component.stopContainer();
    expect(apiSpy.stopContainer).toHaveBeenCalledWith('user-123');
  });

  it('should call provisionContainer API on provision button click', () => {
    component.provisionContainer();
    expect(apiSpy.provisionContainer).toHaveBeenCalledWith('user-123');
  });

  it('should navigate back when back button is clicked', () => {
    component.goBack();
    expect(locationSpy.back).toHaveBeenCalled();
  });

  it('should handle user load error', () => {
    apiSpy.getUser.mockReturnValue(throwError(() => new Error('not found')));
    component['userId'] = 'bad-id';
    component.reload();
    fixture.detectChanges();

    expect(component.error()).toBe('Failed to load user details');
    expect(component.isLoading()).toBe(false);
  });

  it('should handle missing container gracefully', () => {
    apiSpy.getContainer.mockReturnValue(throwError(() => new Error('404')));
    apiSpy.getUser.mockReturnValue(of(mockUser));

    component.reload();
    fixture.detectChanges();

    expect(component.container()).toBeNull();
    expect(component.isLoading()).toBe(false);
  });

  it('should set error when userId is missing', async () => {
    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [UserDetailComponent, NoopAnimationsModule],
      providers: [
        { provide: AdminApiService, useValue: apiSpy },
        { provide: Location, useValue: locationSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => null } },
          },
        },
      ],
    }).compileComponents();

    const f = TestBed.createComponent(UserDetailComponent);
    f.detectChanges();
    expect(f.componentInstance.error()).toBe('User ID is required');
  });
});
