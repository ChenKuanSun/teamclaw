import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import {
  AdminApiService,
  DashboardStats,
} from '../../services/admin-api.service';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let apiSpy: jest.Mocked<Pick<AdminApiService, 'getDashboardStats'>>;

  const mockStats: DashboardStats = {
    totalUsers: 42,
    activeUsers: 30,
    totalTeams: 5,
    activeContainers: 12,
    apiKeyCount: 8,
  };

  beforeEach(async () => {
    apiSpy = {
      getDashboardStats: jest.fn().mockReturnValue(of(mockStats)),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent, NoopAnimationsModule],
      providers: [
        { provide: AdminApiService, useValue: apiSpy },
      ],
    }).compileComponents();
  });

  function createComponent() {
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  }

  it('should show loading spinner while fetching', () => {
    createComponent();
    // Before detectChanges, isLoading is true (default)
    expect(component.isLoading()).toBe(true);
    fixture.detectChanges();
    // After the observable resolves synchronously, loading is done
  });

  it('should display stats cards with correct values after load', () => {
    createComponent();
    fixture.detectChanges();

    expect(component.isLoading()).toBe(false);
    expect(component.stats()).toEqual(mockStats);

    const compiled = fixture.nativeElement as HTMLElement;
    const statValues = compiled.querySelectorAll('.stat-value');
    expect(statValues.length).toBe(4);
    expect(statValues[0].textContent?.trim()).toBe('42');
    expect(statValues[1].textContent?.trim()).toBe('12');
    expect(statValues[2].textContent?.trim()).toBe('5');
    expect(statValues[3].textContent?.trim()).toBe('8');
  });

  it('should display active users sub text', () => {
    createComponent();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const subs = compiled.querySelectorAll('.stat-sub');
    expect(subs[0].textContent?.trim()).toBe('30 active');
  });

  it('should handle API error gracefully', () => {
    apiSpy.getDashboardStats.mockReturnValue(
      throwError(() => new Error('Network error')),
    );

    createComponent();
    fixture.detectChanges();

    expect(component.isLoading()).toBe(false);
    expect(component.error()).toBe('Failed to load dashboard statistics');
    expect(component.stats()).toBeNull();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.error-card')).toBeTruthy();
    expect(compiled.textContent).toContain('Failed to load dashboard statistics');
  });

  it('should retry loading when Retry button is clicked', () => {
    apiSpy.getDashboardStats.mockReturnValue(
      throwError(() => new Error('fail')),
    );

    createComponent();
    fixture.detectChanges();

    // Now make it succeed on retry
    apiSpy.getDashboardStats.mockReturnValue(of(mockStats));

    component.loadStats();
    fixture.detectChanges();

    expect(component.stats()).toEqual(mockStats);
    expect(component.error()).toBeNull();
    expect(apiSpy.getDashboardStats).toHaveBeenCalledTimes(2);
  });
});
