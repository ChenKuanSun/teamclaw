import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { AnalyticsComponent } from './analytics.component';
import {
  AdminApiService,
  SystemAnalyticsResponse,
  UsageByProviderResponse,
} from '../../services/admin-api.service';

describe('AnalyticsComponent', () => {
  let component: AnalyticsComponent;
  let fixture: ComponentFixture<AnalyticsComponent>;
  let apiSpy: jest.Mocked<Pick<AdminApiService, 'getSystemAnalytics' | 'getUsageByProvider'>>;

  const mockAnalytics: SystemAnalyticsResponse = {
    totalUsers: 100,
    activeUsers: 42,
    totalContainers: 30,
    totalApiCalls: 5000,
    dailyStats: [{ date: '2025-03-01', users: 10, apiCalls: 200 }],
  };

  const mockProviderUsage: UsageByProviderResponse = {
    providers: [
      { provider: 'anthropic', requests: 3000, tokens: 500000, cost: 75.00 },
      { provider: 'openai', requests: 2000, tokens: 300000, cost: 50.00 },
    ],
  };

  beforeEach(async () => {
    apiSpy = {
      getSystemAnalytics: jest.fn().mockReturnValue(of(mockAnalytics)),
      getUsageByProvider: jest.fn().mockReturnValue(of(mockProviderUsage)),
    };

    await TestBed.configureTestingModule({
      imports: [AnalyticsComponent, NoopAnimationsModule],
      providers: [
        { provide: AdminApiService, useValue: apiSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should set default date range to last 30 days', () => {
    expect(component.startDate).toBeTruthy();
    expect(component.endDate).toBeTruthy();

    const daysDiff = Math.round(
      (component.endDate!.getTime() - component.startDate!.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(daysDiff).toBe(30);
  });

  it('should load analytics on init', () => {
    expect(apiSpy.getSystemAnalytics).toHaveBeenCalled();
    expect(apiSpy.getUsageByProvider).toHaveBeenCalled();
    expect(component.analytics()).toEqual(mockAnalytics);
  });

  it('should display stats cards', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const statValues = compiled.querySelectorAll('.stat-value');
    expect(statValues.length).toBe(3);
    // Total Requests
    expect(statValues[0].textContent?.trim()).toBe('5,000');
    // Unique Users
    expect(statValues[1].textContent?.trim()).toBe('42');
  });

  it('should display provider breakdown table', () => {
    expect(component.providerUsage()).toEqual(mockProviderUsage);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('anthropic');
    expect(compiled.textContent).toContain('openai');
  });

  it('should refresh data when loadAnalytics is called', () => {
    apiSpy.getSystemAnalytics.mockClear();
    apiSpy.getUsageByProvider.mockClear();

    component.loadAnalytics();
    expect(apiSpy.getSystemAnalytics).toHaveBeenCalled();
    expect(apiSpy.getUsageByProvider).toHaveBeenCalled();
  });

  it('should pass date params to API', () => {
    apiSpy.getSystemAnalytics.mockClear();
    component.startDate = new Date('2025-01-01');
    component.endDate = new Date('2025-01-31');
    component.loadAnalytics();

    expect(apiSpy.getSystemAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      }),
    );
  });

  it('should handle analytics load error', () => {
    apiSpy.getSystemAnalytics.mockReturnValue(throwError(() => new Error('fail')));
    component.loadAnalytics();
    expect(component.loading()).toBe(false);
  });
});
