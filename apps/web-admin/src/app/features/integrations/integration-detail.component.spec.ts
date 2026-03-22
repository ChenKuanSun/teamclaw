import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import {
  AdminApiService,
  IntegrationDetail,
  TeamOverride,
} from '../../services/admin-api.service';
import { IntegrationDetailComponent } from './integration-detail.component';

describe('IntegrationDetailComponent', () => {
  let component: IntegrationDetailComponent;
  let fixture: ComponentFixture<IntegrationDetailComponent>;
  let apiSpy: jest.Mocked<
    Pick<
      AdminApiService,
      | 'getIntegration'
      | 'updateIntegration'
      | 'deleteIntegrationCred'
      | 'updateTeamOverride'
      | 'deleteTeamCred'
    >
  >;
  let routerSpy: { navigate: jest.Mock };

  const mockDetail: IntegrationDetail = {
    integrationId: 'github',
    displayName: 'GitHub',
    description: 'GitHub integration',
    category: 'dev',
    icon: 'code',
    credentialSchema: [
      { key: 'token', label: 'Token', type: 'secret', required: true },
    ],
    envVarPrefix: 'GITHUB',
    enabled: true,
    hasCredentials: true,
    allowUserOverride: false,
    teamOverrides: [
      {
        teamId: 'team-1',
        teamName: 'Alpha',
        enabled: true,
        hasCredentials: true,
        allowUserOverride: false,
      },
    ],
    teamOverrideCount: 1,
  };

  beforeEach(async () => {
    apiSpy = {
      getIntegration: jest.fn().mockReturnValue(of(mockDetail)),
      updateIntegration: jest.fn().mockReturnValue(of({ success: true })),
      deleteIntegrationCred: jest.fn().mockReturnValue(of({ success: true })),
      updateTeamOverride: jest.fn().mockReturnValue(of({ success: true })),
      deleteTeamCred: jest.fn().mockReturnValue(of({ success: true })),
    };
    routerSpy = { navigate: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [IntegrationDetailComponent, NoopAnimationsModule],
      providers: [
        { provide: AdminApiService, useValue: apiSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => 'github' },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IntegrationDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load detail on init', () => {
    expect(apiSpy.getIntegration).toHaveBeenCalledWith('github');
    expect(component.detail()).toEqual(mockDetail);
    expect(component.loading()).toBe(false);
  });

  it('should set loading to false on error', () => {
    apiSpy.getIntegration.mockReturnValue(throwError(() => new Error('fail')));
    component.loadDetail();
    expect(component.loading()).toBe(false);
  });

  it('should navigate back to integrations list', () => {
    component.goBack();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/integrations']);
  });

  describe('toggleEnabled()', () => {
    it('should call updateIntegration with enabled flag', () => {
      component.toggleEnabled(false);
      expect(apiSpy.updateIntegration).toHaveBeenCalledWith('github', {
        enabled: false,
      });
    });

    it('should reload detail after update', () => {
      apiSpy.getIntegration.mockClear();
      component.toggleEnabled(true);
      expect(apiSpy.getIntegration).toHaveBeenCalled();
    });

    it('should show snackbar on error', () => {
      const snackBar = (component as any).snackBar as MatSnackBar;
      jest.spyOn(snackBar, 'open');
      apiSpy.updateIntegration.mockReturnValue(
        throwError(() => ({ error: { message: 'Forbidden' } })),
      );
      component.toggleEnabled(false);
      expect(snackBar.open).toHaveBeenCalledWith(
        'Forbidden',
        'OK',
        expect.objectContaining({ panelClass: 'snackbar-error' }),
      );
    });
  });

  describe('openCredentialDialog()', () => {
    it('should open credential dialog', () => {
      const afterClosedSubject = new Subject<any>();
      const dialog = (component as any).dialog as MatDialog;
      jest.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

      component.openCredentialDialog('global');
      expect(dialog.open).toHaveBeenCalled();
    });

    it('should save credentials when dialog returns result', () => {
      const afterClosedSubject = new Subject<any>();
      const dialog = (component as any).dialog as MatDialog;
      jest.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

      component.openCredentialDialog('global');
      afterClosedSubject.next({ token: 'ghp_abc' });

      expect(apiSpy.updateIntegration).toHaveBeenCalledWith('github', {
        credentials: { token: 'ghp_abc' },
      });
    });

    it('should not save when dialog is cancelled', () => {
      const afterClosedSubject = new Subject<any>();
      const dialog = (component as any).dialog as MatDialog;
      jest.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

      component.openCredentialDialog('global');
      afterClosedSubject.next(undefined);

      expect(apiSpy.updateIntegration).not.toHaveBeenCalled();
    });

    it('should do nothing if detail is null', () => {
      component.detail.set(null);
      const dialog = (component as any).dialog as MatDialog;
      jest.spyOn(dialog, 'open');
      component.openCredentialDialog('global');
      expect(dialog.open).not.toHaveBeenCalled();
    });
  });

  describe('removeGlobalCred()', () => {
    it('should delete credential after confirmation', () => {
      const afterClosedSubject = new Subject<any>();
      const dialog = (component as any).dialog as MatDialog;
      jest.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

      component.removeGlobalCred();
      afterClosedSubject.next(true);

      expect(apiSpy.deleteIntegrationCred).toHaveBeenCalledWith('github');
    });

    it('should not delete when confirmation declined', () => {
      const afterClosedSubject = new Subject<any>();
      const dialog = (component as any).dialog as MatDialog;
      jest.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

      component.removeGlobalCred();
      afterClosedSubject.next(false);

      expect(apiSpy.deleteIntegrationCred).not.toHaveBeenCalled();
    });
  });

  describe('openTeamOverrideDialog()', () => {
    it('should open team override dialog', () => {
      const afterClosedSubject = new Subject<any>();
      const dialog = (component as any).dialog as MatDialog;
      jest.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

      component.openTeamOverrideDialog();
      expect(dialog.open).toHaveBeenCalled();
    });

    it('should save team override when dialog returns result', () => {
      const afterClosedSubject = new Subject<any>();
      const dialog = (component as any).dialog as MatDialog;
      jest.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

      component.openTeamOverrideDialog();
      afterClosedSubject.next({
        teamId: 'team-2',
        enabled: true,
        allowUserOverride: false,
        credentials: { token: 'xxx' },
      });

      expect(apiSpy.updateTeamOverride).toHaveBeenCalledWith(
        'github',
        'team-2',
        {
          enabled: true,
          allowUserOverride: false,
          credentials: { token: 'xxx' },
        },
      );
    });

    it('should not save when dialog is cancelled', () => {
      const afterClosedSubject = new Subject<any>();
      const dialog = (component as any).dialog as MatDialog;
      jest.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

      component.openTeamOverrideDialog();
      afterClosedSubject.next(undefined);

      expect(apiSpy.updateTeamOverride).not.toHaveBeenCalled();
    });
  });

  describe('toggleTeamUserOverride()', () => {
    it('should call updateTeamOverride with allowUserOverride flag', () => {
      const row: TeamOverride = mockDetail.teamOverrides[0];
      component.toggleTeamUserOverride(row, true);
      expect(apiSpy.updateTeamOverride).toHaveBeenCalledWith(
        'github',
        'team-1',
        { allowUserOverride: true },
      );
    });
  });

  describe('removeTeamCred()', () => {
    it('should delete team credential after confirmation', () => {
      const afterClosedSubject = new Subject<any>();
      const dialog = (component as any).dialog as MatDialog;
      jest.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

      component.removeTeamCred(mockDetail.teamOverrides[0]);
      afterClosedSubject.next(true);

      expect(apiSpy.deleteTeamCred).toHaveBeenCalledWith('github', 'team-1');
    });

    it('should not delete when confirmation declined', () => {
      const afterClosedSubject = new Subject<any>();
      const dialog = (component as any).dialog as MatDialog;
      jest.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

      component.removeTeamCred(mockDetail.teamOverrides[0]);
      afterClosedSubject.next(false);

      expect(apiSpy.deleteTeamCred).not.toHaveBeenCalled();
    });
  });

  describe('editTeamOverride()', () => {
    it('should call openTeamOverrideDialog with existing row', () => {
      jest.spyOn(component, 'openTeamOverrideDialog');
      component.editTeamOverride(mockDetail.teamOverrides[0]);
      expect(component.openTeamOverrideDialog).toHaveBeenCalledWith(
        mockDetail.teamOverrides[0],
      );
    });
  });
});
