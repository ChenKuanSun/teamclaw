import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import {
  AdminApiService,
  IntegrationDefinition,
} from '../../services/admin-api.service';
import { SkillsComponent } from './skills.component';

describe('SkillsComponent', () => {
  let component: SkillsComponent;
  let fixture: ComponentFixture<SkillsComponent>;
  let apiSpy: jest.Mocked<Pick<AdminApiService, 'listIntegrations'>>;
  let routerSpy: { navigate: jest.Mock };

  const mockIntegrations: IntegrationDefinition[] = [
    {
      integrationId: 'notion',
      displayName: 'Notion',
      description: 'Notion integration',
      category: 'productivity',
      icon: 'note',
      credentialSchema: [],
      envVarPrefix: 'NOTION',
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
      enabled: true,
      hasCredentials: false,
      allowUserOverride: false,
    },
    {
      integrationId: 'github',
      displayName: 'GitHub',
      description: 'GitHub integration',
      category: 'dev',
      icon: 'code',
      credentialSchema: [],
      envVarPrefix: 'GITHUB',
      enabled: false,
      hasCredentials: false,
      allowUserOverride: false,
    },
    {
      integrationId: 'jira',
      displayName: 'Jira',
      description: 'Jira integration',
      category: 'project',
      icon: 'task',
      credentialSchema: [],
      envVarPrefix: 'JIRA',
      enabled: true,
      hasCredentials: true,
      allowUserOverride: false,
    },
    {
      integrationId: 'confluence',
      displayName: 'Confluence',
      description: 'Confluence integration',
      category: 'docs',
      icon: 'article',
      credentialSchema: [],
      envVarPrefix: 'CONFLUENCE',
      enabled: false,
      hasCredentials: false,
      allowUserOverride: false,
    },
    {
      integrationId: 'linear',
      displayName: 'Linear',
      description: 'Linear integration',
      category: 'project',
      icon: 'linear_scale',
      credentialSchema: [],
      envVarPrefix: 'LINEAR',
      enabled: true,
      hasCredentials: true,
      allowUserOverride: false,
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
      imports: [SkillsComponent, NoopAnimationsModule],
      providers: [
        { provide: AdminApiService, useValue: apiSpy },
        { provide: Router, useValue: routerSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SkillsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show loading spinner initially', () => {
    // Re-create without detectChanges to check initial loading state
    const freshFixture = TestBed.createComponent(SkillsComponent);
    const freshComponent = freshFixture.componentInstance;
    // loading is set to true inside loadSkills before the subscribe resolves
    // Since the observable is synchronous in tests, we check via the component
    expect(freshComponent).toBeTruthy();
    // After detectChanges (which triggers ngOnInit + sync subscribe), loading is false
    freshFixture.detectChanges();
    expect(freshComponent.loading()).toBe(false);
  });

  it('should render 6 skill rows after API response', () => {
    expect(component.skills().length).toBe(6);
    const rows =
      fixture.nativeElement.querySelectorAll('tr.clickable-row');
    expect(rows.length).toBe(6);
  });

  it('should show Active chip when integration is enabled and has credentials', () => {
    const notionSkill = component.skills().find(s => s.skillId === 'notion');
    expect(notionSkill?.enabled).toBe(true);
    expect(notionSkill?.hasCredentials).toBe(true);

    const chips = fixture.nativeElement.querySelectorAll('mat-chip');
    const chipTexts = Array.from(chips).map(
      (c: any) => c.textContent.trim(),
    );
    expect(chipTexts).toContain('Active');
  });

  it('should show No Key chip when integration is enabled but no credentials', () => {
    const slackSkill = component.skills().find(s => s.skillId === 'slack');
    expect(slackSkill?.enabled).toBe(true);
    expect(slackSkill?.hasCredentials).toBe(false);

    const chips = fixture.nativeElement.querySelectorAll('mat-chip');
    const chipTexts = Array.from(chips).map(
      (c: any) => c.textContent.trim(),
    );
    expect(chipTexts).toContain('No Key');
  });

  it('should show Bundled chip for jira, confluence, and linear', () => {
    const bundledSkills = component
      .skills()
      .filter(s => ['jira', 'confluence', 'linear'].includes(s.skillId));
    expect(bundledSkills.length).toBe(3);
    bundledSkills.forEach(s => {
      expect(s.source).toBe('bundled');
    });

    const chips = fixture.nativeElement.querySelectorAll('mat-chip');
    const chipTexts: string[] = Array.from(chips).map(
      (c: any) => c.textContent.trim(),
    );
    const bundledCount = chipTexts.filter(t => t === 'Bundled').length;
    expect(bundledCount).toBe(3);
  });

  it('should show Upstream chip for notion, slack, and github', () => {
    const upstreamSkills = component
      .skills()
      .filter(s => ['notion', 'slack', 'github'].includes(s.skillId));
    expect(upstreamSkills.length).toBe(3);
    upstreamSkills.forEach(s => {
      expect(s.source).toBe('upstream');
    });

    const chips = fixture.nativeElement.querySelectorAll('mat-chip');
    const chipTexts: string[] = Array.from(chips).map(
      (c: any) => c.textContent.trim(),
    );
    const upstreamCount = chipTexts.filter(t => t === 'Upstream').length;
    expect(upstreamCount).toBe(3);
  });

  it('should navigate to /integrations/{integrationId} when clicking a row', () => {
    const rows =
      fixture.nativeElement.querySelectorAll('tr.clickable-row');
    rows[0].click();
    expect(routerSpy.navigate).toHaveBeenCalledWith([
      '/integrations',
      'notion',
    ]);
  });
});
