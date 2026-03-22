import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import {
  AdminApiService,
  IntegrationDefinition,
} from '../../services/admin-api.service';
import { IntegrationsComponent } from './integrations.component';

describe('IntegrationsComponent', () => {
  let component: IntegrationsComponent;
  let fixture: ComponentFixture<IntegrationsComponent>;
  let apiSpy: jest.Mocked<Pick<AdminApiService, 'listIntegrations'>>;
  let routerSpy: { navigate: jest.Mock };

  const mockIntegrations: IntegrationDefinition[] = [
    {
      integrationId: 'github',
      displayName: 'GitHub',
      description: 'GitHub integration',
      category: 'dev',
      icon: 'code',
      credentialSchema: [],
      envVarPrefix: 'GITHUB',
      enabled: true,
      hasCredentials: true,
      allowUserOverride: false,
    },
    {
      integrationId: 'slack',
      displayName: 'Slack',
      description: 'Slack integration',
      category: 'comms',
      icon: 'chat',
      credentialSchema: [],
      envVarPrefix: 'SLACK',
      enabled: false,
      hasCredentials: false,
      allowUserOverride: true,
    },
  ];

  beforeEach(async () => {
    apiSpy = {
      listIntegrations: jest
        .fn()
        .mockReturnValue(of({ integrations: mockIntegrations })),
    };
    routerSpy = { navigate: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [IntegrationsComponent, NoopAnimationsModule],
      providers: [
        { provide: AdminApiService, useValue: apiSpy },
        { provide: Router, useValue: routerSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IntegrationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load integrations on init', () => {
    expect(apiSpy.listIntegrations).toHaveBeenCalled();
    expect(component.integrations().length).toBe(2);
    expect(component.loading()).toBe(false);
  });

  it('should set integrations signal from API response', () => {
    expect(component.integrations()[0].displayName).toBe('GitHub');
    expect(component.integrations()[1].displayName).toBe('Slack');
  });

  it('should set loading to false on error', () => {
    apiSpy.listIntegrations.mockReturnValue(
      throwError(() => new Error('fail')),
    );
    component.loadIntegrations();
    expect(component.loading()).toBe(false);
  });

  it('should navigate to detail page on openDetail', () => {
    component.openDetail(mockIntegrations[0]);
    expect(routerSpy.navigate).toHaveBeenCalledWith([
      '/integrations',
      'github',
    ]);
  });

  it('should have correct displayed columns', () => {
    expect(component.displayedColumns).toEqual([
      'icon',
      'name',
      'description',
      'category',
      'status',
      'actions',
    ]);
  });
});
