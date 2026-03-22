import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { AdminApiService } from '../../services/admin-api.service';
import {
  TeamOverrideDialogComponent,
  TeamOverrideDialogData,
} from './team-override-dialog.component';

describe('TeamOverrideDialogComponent', () => {
  let component: TeamOverrideDialogComponent;
  let fixture: ComponentFixture<TeamOverrideDialogComponent>;
  let dialogRefSpy: jest.Mocked<Pick<MatDialogRef<any>, 'close'>>;
  let apiSpy: jest.Mocked<Pick<AdminApiService, 'queryTeams'>>;

  const baseData: TeamOverrideDialogData = {
    integrationName: 'GitHub',
    schema: [{ key: 'token', label: 'Token', type: 'secret', required: true }],
  };

  function setup(data: TeamOverrideDialogData = baseData) {
    dialogRefSpy = { close: jest.fn() };
    apiSpy = {
      queryTeams: jest.fn().mockReturnValue(
        of({
          teams: [
            { teamId: 't1', teamName: 'Alpha', memberCount: 5 },
            { teamId: 't2', teamName: 'Beta', memberCount: 3 },
          ],
        }),
      ),
    };

    TestBed.configureTestingModule({
      imports: [TeamOverrideDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: AdminApiService, useValue: apiSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TeamOverrideDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  describe('new override (no existing team)', () => {
    beforeEach(() => setup());

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should load teams on init when no existingTeamId', () => {
      expect(apiSpy.queryTeams).toHaveBeenCalledWith({ limit: 100 });
      expect(component.teams().length).toBe(2);
    });

    it('should default enabled to true', () => {
      expect(component.enabled).toBe(true);
    });

    it('should default allowUserOverride to true', () => {
      expect(component.allowUserOverride).toBe(true);
    });

    describe('canSave()', () => {
      it('should return false when no team selected', () => {
        component.selectedTeamId = '';
        expect(component.canSave()).toBe(false);
      });

      it('should return true when team is selected', () => {
        component.selectedTeamId = 't1';
        expect(component.canSave()).toBe(true);
      });
    });

    describe('setCredValue()', () => {
      it('should update credential values', () => {
        component.setCredValue('token', 'ghp_abc');
        expect(component.credValues()).toEqual({ token: 'ghp_abc' });
      });
    });

    describe('save()', () => {
      it('should close with result including credentials when provided', () => {
        component.selectedTeamId = 't1';
        component.enabled = true;
        component.allowUserOverride = false;
        component.setCredValue('token', 'ghp_abc');
        component.save();

        expect(dialogRefSpy.close).toHaveBeenCalledWith({
          teamId: 't1',
          enabled: true,
          allowUserOverride: false,
          credentials: { token: 'ghp_abc' },
        });
      });

      it('should close without credentials when values are empty', () => {
        component.selectedTeamId = 't1';
        component.save();

        expect(dialogRefSpy.close).toHaveBeenCalledWith({
          teamId: 't1',
          enabled: true,
          allowUserOverride: true,
        });
      });

      it('should not include credentials when values are whitespace only', () => {
        component.selectedTeamId = 't1';
        component.setCredValue('token', '   ');
        component.save();

        const result = dialogRefSpy.close.mock.calls[0][0];
        expect(result.credentials).toBeUndefined();
      });
    });
  });

  describe('editing existing override', () => {
    beforeEach(() => {
      setup({
        ...baseData,
        existingTeamId: 't1',
        existingEnabled: false,
        existingAllowUserOverride: false,
      });
    });

    it('should not load teams when existingTeamId is set', () => {
      expect(apiSpy.queryTeams).not.toHaveBeenCalled();
    });

    it('should initialize with existing values', () => {
      expect(component.selectedTeamId).toBe('t1');
      expect(component.enabled).toBe(false);
      expect(component.allowUserOverride).toBe(false);
    });
  });
});
