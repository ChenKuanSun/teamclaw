import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { of, throwError } from 'rxjs';
import { UsersComponent } from './users.component';
import {
  AdminApiService,
  AdminUser,
  QueryUsersResponse,
} from '../../services/admin-api.service';

describe('UsersComponent', () => {
  let component: UsersComponent;
  let fixture: ComponentFixture<UsersComponent>;
  let apiSpy: jest.Mocked<Pick<AdminApiService, 'queryUsers' | 'startContainer' | 'stopContainer'>>;

  const mockUsers: AdminUser[] = [
    { userId: 'u1', email: 'alice@test.com', status: 'running', createdAt: '2025-01-01' },
    { userId: 'u2', email: 'bob@test.com', teamId: 'team1', status: 'stopped', createdAt: '2025-01-02', lastActiveAt: '2025-03-01' },
    { userId: 'u3', email: 'carol@test.com', status: 'provisioned', createdAt: '2025-01-03' },
  ];

  const mockResponse: QueryUsersResponse = { users: mockUsers, total: 3 };

  beforeEach(async () => {
    apiSpy = {
      queryUsers: jest.fn().mockReturnValue(of(mockResponse)),
      startContainer: jest.fn().mockReturnValue(of({})),
      stopContainer: jest.fn().mockReturnValue(of({})),
    };

    await TestBed.configureTestingModule({
      imports: [UsersComponent, NoopAnimationsModule, RouterModule.forRoot([])],
      providers: [
        { provide: AdminApiService, useValue: apiSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UsersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render table with user data', () => {
    expect(component.users()).toEqual(mockUsers);
    expect(component.totalUsers()).toBe(3);

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tr.mat-mdc-row');
    expect(rows.length).toBe(3);
  });

  it('should display user emails in the table', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('alice@test.com');
    expect(compiled.textContent).toContain('bob@test.com');
  });

  it('should search/filter users by email', () => {
    const searchResponse: QueryUsersResponse = {
      users: [mockUsers[0]],
      total: 1,
    };
    apiSpy.queryUsers.mockReturnValue(of(searchResponse));

    component.onEmailSearch({ target: { value: 'alice' } } as unknown as Event);
    fixture.detectChanges();

    expect(component.emailFilter()).toBe('alice');
    expect(component.pageIndex()).toBe(0);
    expect(apiSpy.queryUsers).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alice' }),
    );
  });

  it('should handle pagination - page change triggers reload', () => {
    apiSpy.queryUsers.mockClear();
    apiSpy.queryUsers.mockReturnValue(of(mockResponse));

    component.onPageChange({ pageIndex: 2, pageSize: 10, length: 50 });
    expect(component.pageIndex()).toBe(2);
    expect(component.pageSize()).toBe(10);
    expect(apiSpy.queryUsers).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 20 }),
    );
  });

  it('should show correct status badge classes', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const badges = compiled.querySelectorAll('.status-badge');
    expect(badges.length).toBe(3);
    expect(badges[0].classList.contains('status-running')).toBe(true);
    expect(badges[1].classList.contains('status-stopped')).toBe(true);
    expect(badges[2].classList.contains('status-provisioned')).toBe(true);
  });

  it('should call startContainer API when start button clicked', () => {
    component.startContainer('u1');
    expect(apiSpy.startContainer).toHaveBeenCalledWith('u1');
  });

  it('should call stopContainer API when stop button clicked', () => {
    component.stopContainer('u2');
    expect(apiSpy.stopContainer).toHaveBeenCalledWith('u2');
  });

  it('should handle query error gracefully', () => {
    apiSpy.queryUsers.mockReturnValue(throwError(() => new Error('fail')));
    component.loadUsers();
    fixture.detectChanges();

    expect(component.isLoading()).toBe(false);
    expect(component.error()).toBe('Failed to load users');
  });
});
