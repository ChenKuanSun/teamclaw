import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { of, Subject } from 'rxjs';
import { ConfigComponent } from './config.component';
import {
  AdminApiService,
  ConfigEntry,
} from '../../services/admin-api.service';

describe('ConfigComponent', () => {
  let component: ConfigComponent;
  let fixture: ComponentFixture<ConfigComponent>;
  let apiSpy: jest.Mocked<Pick<AdminApiService, 'getGlobalConfig' | 'updateGlobalConfig' | 'getTeamConfig' | 'updateTeamConfig' | 'getUserConfig' | 'updateUserConfig' | 'queryTeams' | 'queryUsers'>>;

  const globalConfigs: ConfigEntry[] = [
    { configKey: 'SOUL.md', value: 'You are an assistant' },
    { configKey: 'MAX_TOKENS', value: '4096' },
  ];

  const teamConfigs: ConfigEntry[] = [
    { configKey: 'TEAM_SOUL.md', value: 'Team specific instructions' },
  ];

  beforeEach(async () => {
    apiSpy = {
      getGlobalConfig: jest.fn().mockReturnValue(of({ configs: globalConfigs })),
      updateGlobalConfig: jest.fn().mockReturnValue(of({ success: true })),
      getTeamConfig: jest.fn().mockReturnValue(of({ configs: teamConfigs })),
      updateTeamConfig: jest.fn().mockReturnValue(of({ success: true })),
      getUserConfig: jest.fn().mockReturnValue(of({ configs: [] })),
      updateUserConfig: jest.fn().mockReturnValue(of({ success: true })),
      queryTeams: jest.fn().mockReturnValue(of({ teams: [{ teamId: 't1', name: 'Alpha', createdAt: '' }], total: 1 })),
      queryUsers: jest.fn().mockReturnValue(of({ users: [{ userId: 'u1', email: 'a@b.com', status: 'active', createdAt: '' }], total: 1 })),
    };

    await TestBed.configureTestingModule({
      imports: [ConfigComponent, NoopAnimationsModule],
      providers: [
        { provide: AdminApiService, useValue: apiSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function getComponentDialog(): MatDialog {
    return (component as any).dialog;
  }

  it('should load global config on init', () => {
    expect(apiSpy.getGlobalConfig).toHaveBeenCalled();
    expect(component.configs()).toEqual(globalConfigs);
  });

  it('should load teams and users on init', () => {
    expect(apiSpy.queryTeams).toHaveBeenCalledWith({ limit: 100 });
    expect(apiSpy.queryUsers).toHaveBeenCalledWith({ limit: 100 });
  });

  it('should display config keys in the table', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('SOUL.md');
    expect(compiled.textContent).toContain('MAX_TOKENS');
  });

  it('should switch to team tab and clear configs', () => {
    component.onTabChange(1);
    expect(component.configs()).toEqual([]);
  });

  it('should load team config when team tab selected and team is chosen', () => {
    component.selectedTeamId = 't1';
    component.onTabChange(1);
    expect(apiSpy.getTeamConfig).toHaveBeenCalledWith('t1');
  });

  it('should load user config when user tab selected and user is chosen', () => {
    component.selectedUserId = 'u1';
    component.onTabChange(2);
    expect(apiSpy.getUserConfig).toHaveBeenCalledWith('u1');
  });

  it('should open edit dialog for a config entry', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => afterClosedSubject.asObservable() } as any);

    component.editConfig(globalConfigs[0]);
    expect(dialog.open).toHaveBeenCalled();

    const dialogCall = (dialog.open as jest.Mock).mock.calls[0];
    expect(dialogCall[1]?.data?.isLargeText).toBe(true);
  });

  it('should save config when dialog returns result (global tab)', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => afterClosedSubject.asObservable() } as any);

    component.editConfig(globalConfigs[1]);
    afterClosedSubject.next({ configKey: 'MAX_TOKENS', value: '8192' });

    expect(apiSpy.updateGlobalConfig).toHaveBeenCalledWith({ configKey: 'MAX_TOKENS', value: '8192' });
  });

  it('should not save when dialog is cancelled', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => afterClosedSubject.asObservable() } as any);

    component.editConfig(globalConfigs[0]);
    afterClosedSubject.next(undefined);

    expect(apiSpy.updateGlobalConfig).not.toHaveBeenCalled();
  });

  it('should reload global config on tab 0', () => {
    apiSpy.getGlobalConfig.mockClear();
    component.onTabChange(0);
    expect(apiSpy.getGlobalConfig).toHaveBeenCalled();
  });
});
