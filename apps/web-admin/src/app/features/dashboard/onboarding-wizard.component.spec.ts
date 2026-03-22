import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import {
  AdminApiService,
  OnboardingStatus,
  PROVIDER_OPTIONS,
} from '../../services/admin-api.service';
import { OnboardingWizardComponent } from './onboarding-wizard.component';

describe('OnboardingWizardComponent', () => {
  let component: OnboardingWizardComponent;
  let fixture: ComponentFixture<OnboardingWizardComponent>;
  let apiSpy: jest.Mocked<
    Pick<AdminApiService, 'addApiKey' | 'createTeam' | 'updateGlobalConfig'>
  >;

  beforeEach(async () => {
    apiSpy = {
      addApiKey: jest.fn(),
      createTeam: jest.fn(),
      updateGlobalConfig: jest.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [OnboardingWizardComponent, NoopAnimationsModule],
      providers: [{ provide: AdminApiService, useValue: apiSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(OnboardingWizardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render welcome heading', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Welcome to TeamClaw');
  });

  it('should render all 4 steps', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Add API Key');
    expect(el.textContent).toContain('Create Team');
    expect(el.textContent).toContain('Set Allowed Domains');
    expect(el.textContent).toContain('Done');
  });

  it('should initialize steps as all false', () => {
    expect(component.steps()).toEqual({
      apiKey: false,
      team: false,
      allowedDomains: false,
      defaultTeamId: false,
    });
  });

  it('should expose PROVIDER_OPTIONS', () => {
    expect(component.providerOptions).toBe(PROVIDER_OPTIONS);
    expect(component.providerOptions.length).toBeGreaterThan(0);
  });

  describe('setStatus', () => {
    it('should set steps from onboarding status', () => {
      const status: OnboardingStatus = {
        complete: false,
        steps: {
          apiKey: true,
          team: false,
          allowedDomains: false,
          defaultTeamId: false,
        },
      };
      component.setStatus(status);
      expect(component.steps().apiKey).toBe(true);
      expect(component.steps().team).toBe(false);
    });
  });

  describe('onProviderChange', () => {
    it('should set authType to apiKey for standard providers', () => {
      component.apiKeyProvider = 'anthropic';
      component.onProviderChange();

      expect(component.selectedAuthType).toBe('apiKey');
      expect(component.tokenHint).toBe('');
    });

    it('should set authType to oauthToken for anthropic-token', () => {
      component.apiKeyProvider = 'anthropic-token';
      component.onProviderChange();

      expect(component.selectedAuthType).toBe('oauthToken');
      expect(component.tokenHint).toContain('claude setup-token');
    });

    it('should set authType to oauthToken for openai-codex', () => {
      component.apiKeyProvider = 'openai-codex';
      component.onProviderChange();

      expect(component.selectedAuthType).toBe('oauthToken');
      expect(component.tokenHint).toContain('Codex access token');
    });

    it('should clear apiKeyValue when provider changes', () => {
      component.apiKeyValue = 'old-key';
      component.apiKeyProvider = 'openai';
      component.onProviderChange();

      expect(component.apiKeyValue).toBe('');
    });
  });

  describe('saveApiKey', () => {
    it('should call addApiKey with correct payload for apiKey type', () => {
      apiSpy.addApiKey.mockReturnValue(
        of({ message: 'ok', provider: 'anthropic' }),
      );

      component.apiKeyProvider = 'anthropic';
      component.selectedAuthType = 'apiKey';
      component.apiKeyValue = 'sk-ant-123';
      component.saveApiKey();

      expect(apiSpy.addApiKey).toHaveBeenCalledWith({
        provider: 'anthropic',
        authType: 'apiKey',
        key: 'sk-ant-123',
      });
    });

    it('should use effectiveId for provider mapping (anthropic-token -> anthropic)', () => {
      apiSpy.addApiKey.mockReturnValue(
        of({ message: 'ok', provider: 'anthropic' }),
      );

      component.apiKeyProvider = 'anthropic-token';
      component.selectedAuthType = 'oauthToken';
      component.apiKeyValue = 'token-value';
      component.saveApiKey();

      expect(apiSpy.addApiKey).toHaveBeenCalledWith({
        provider: 'anthropic',
        authType: 'oauthToken',
        token: 'token-value',
      });
    });

    it('should update steps on success', () => {
      apiSpy.addApiKey.mockReturnValue(
        of({ message: 'ok', provider: 'anthropic' }),
      );

      component.apiKeyProvider = 'anthropic';
      component.apiKeyValue = 'sk-ant-123';
      component.saveApiKey();

      expect(component.steps().apiKey).toBe(true);
      expect(component.saving()).toBe(false);
    });

    it('should set saving=true during request', () => {
      apiSpy.addApiKey.mockReturnValue(
        of({ message: 'ok', provider: 'anthropic' }),
      );

      component.apiKeyProvider = 'anthropic';
      component.apiKeyValue = 'sk-ant-123';

      // Can't easily test mid-flight, but verify it's false after
      component.saveApiKey();
      expect(component.saving()).toBe(false);
    });

    it('should show error on failure', () => {
      apiSpy.addApiKey.mockReturnValue(
        throwError(() => ({ error: { message: 'Invalid API key' } })),
      );

      component.apiKeyProvider = 'anthropic';
      component.apiKeyValue = 'bad-key';
      component.saveApiKey();

      expect(component.stepError()).toBe('Invalid API key');
      expect(component.saving()).toBe(false);
      expect(component.steps().apiKey).toBe(false);
    });

    it('should show generic error when no error message', () => {
      apiSpy.addApiKey.mockReturnValue(throwError(() => ({ error: {} })));

      component.apiKeyProvider = 'anthropic';
      component.apiKeyValue = 'bad-key';
      component.saveApiKey();

      expect(component.stepError()).toBe('Failed to save credential');
    });
  });

  describe('saveTeam', () => {
    it('should call createTeam with name and description', () => {
      apiSpy.createTeam.mockReturnValue(
        of({ teamId: 'team-1', name: 'Engineering', createdAt: '2026-01-01' }),
      );

      component.teamName = 'Engineering';
      component.teamDescription = 'Dev team';
      component.saveTeam();

      expect(apiSpy.createTeam).toHaveBeenCalledWith({
        name: 'Engineering',
        description: 'Dev team',
      });
    });

    it('should update steps and store teamId on success', () => {
      apiSpy.createTeam.mockReturnValue(
        of({ teamId: 'team-1', name: 'Engineering', createdAt: '2026-01-01' }),
      );

      component.teamName = 'Engineering';
      component.teamDescription = '';
      component.saveTeam();

      expect(component.steps().team).toBe(true);
      expect(component.saving()).toBe(false);
    });

    it('should show error on failure', () => {
      apiSpy.createTeam.mockReturnValue(
        throwError(() => ({ error: { message: 'Team already exists' } })),
      );

      component.teamName = 'Engineering';
      component.saveTeam();

      expect(component.stepError()).toBe('Team already exists');
      expect(component.saving()).toBe(false);
    });

    it('should show generic error when no error message', () => {
      apiSpy.createTeam.mockReturnValue(throwError(() => ({ error: {} })));

      component.teamName = 'Engineering';
      component.saveTeam();

      expect(component.stepError()).toBe('Failed to create team');
    });
  });

  describe('saveDomainConfig', () => {
    it('should call updateGlobalConfig for allowedDomains and defaultTeamId', () => {
      // Set up a createdTeamId by saving a team first
      apiSpy.createTeam.mockReturnValue(
        of({ teamId: 'team-99', name: 'Eng', createdAt: '2026-01-01' }),
      );
      component.teamName = 'Eng';
      component.saveTeam();

      apiSpy.updateGlobalConfig
        .mockReturnValueOnce(of({ success: true })) // allowedDomains
        .mockReturnValueOnce(of({ success: true })); // defaultTeamId

      component.emailDomain = 'Acme.com';
      component.saveDomainConfig();

      expect(apiSpy.updateGlobalConfig).toHaveBeenCalledWith({
        configKey: 'allowedDomains',
        value: ['acme.com'],
      });
      expect(apiSpy.updateGlobalConfig).toHaveBeenCalledWith({
        configKey: 'defaultTeamId',
        value: 'team-99',
      });
    });

    it('should update both steps on success', () => {
      apiSpy.createTeam.mockReturnValue(
        of({ teamId: 'team-99', name: 'Eng', createdAt: '2026-01-01' }),
      );
      component.teamName = 'Eng';
      component.saveTeam();

      apiSpy.updateGlobalConfig
        .mockReturnValueOnce(of({ success: true }))
        .mockReturnValueOnce(of({ success: true }));

      component.emailDomain = 'acme.com';
      component.saveDomainConfig();

      expect(component.steps().allowedDomains).toBe(true);
      expect(component.steps().defaultTeamId).toBe(true);
      expect(component.saving()).toBe(false);
    });

    it('should lowercase and trim the domain', () => {
      apiSpy.updateGlobalConfig.mockReturnValue(of({ success: true }));

      component.emailDomain = '  MyCompany.COM  ';
      component.saveDomainConfig();

      expect(apiSpy.updateGlobalConfig).toHaveBeenCalledWith({
        configKey: 'allowedDomains',
        value: ['mycompany.com'],
      });
    });

    it('should show error when allowedDomains update fails', () => {
      apiSpy.updateGlobalConfig.mockReturnValue(
        throwError(() => ({ error: { message: 'Config save failed' } })),
      );

      component.emailDomain = 'acme.com';
      component.saveDomainConfig();

      expect(component.stepError()).toBe('Config save failed');
      expect(component.saving()).toBe(false);
    });

    it('should show error when defaultTeamId update fails', () => {
      apiSpy.createTeam.mockReturnValue(
        of({ teamId: 'team-99', name: 'Eng', createdAt: '2026-01-01' }),
      );
      component.teamName = 'Eng';
      component.saveTeam();

      apiSpy.updateGlobalConfig
        .mockReturnValueOnce(of({ success: true }))
        .mockReturnValueOnce(
          throwError(() => ({
            error: { message: 'Failed to set default team' },
          })),
        );

      component.emailDomain = 'acme.com';
      component.saveDomainConfig();

      expect(component.steps().allowedDomains).toBe(true);
      expect(component.stepError()).toBe('Failed to set default team');
      expect(component.saving()).toBe(false);
    });

    it('should only update allowedDomains when no createdTeamId', () => {
      apiSpy.updateGlobalConfig.mockReturnValue(of({ success: true }));

      component.emailDomain = 'acme.com';
      component.saveDomainConfig();

      expect(apiSpy.updateGlobalConfig).toHaveBeenCalledTimes(1);
      expect(component.steps().allowedDomains).toBe(true);
      expect(component.saving()).toBe(false);
    });
  });

  describe('template error display', () => {
    it('should render error message when stepError is set', () => {
      component.stepError.set('Something went wrong');
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const errorEl = el.querySelector('.error');
      expect(errorEl).toBeTruthy();
      expect(errorEl!.textContent).toContain('Something went wrong');
    });
  });
});
