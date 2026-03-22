import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { of, Subject, throwError } from 'rxjs';
import {
  IntegrationsService,
  UserIntegration,
} from '../../services/integrations.service';
import { UserIntegrationsComponent } from './user-integrations.component';

describe('UserIntegrationsComponent', () => {
  let component: UserIntegrationsComponent;
  let fixture: ComponentFixture<UserIntegrationsComponent>;
  let serviceSpy: jest.Mocked<
    Pick<
      IntegrationsService,
      'listMyIntegrations' | 'connectIntegration' | 'disconnectIntegration'
    >
  >;

  const mockIntegrations: UserIntegration[] = [
    {
      integrationId: 'github',
      displayName: 'GitHub',
      icon: 'code',
      category: 'dev',
      credentialSource: 'global',
      allowUserOverride: true,
      credentialSchema: [
        { key: 'token', label: 'Token', type: 'secret', required: true },
      ],
    },
    {
      integrationId: 'slack',
      displayName: 'Slack',
      icon: 'chat',
      category: 'comms',
      credentialSource: 'none',
      allowUserOverride: true,
    },
  ];

  beforeEach(async () => {
    serviceSpy = {
      listMyIntegrations: jest
        .fn()
        .mockReturnValue(of({ integrations: mockIntegrations })),
      connectIntegration: jest.fn().mockReturnValue(of({ success: true })),
      disconnectIntegration: jest.fn().mockReturnValue(of({ success: true })),
    };

    await TestBed.configureTestingModule({
      imports: [
        UserIntegrationsComponent,
        NoopAnimationsModule,
        TranslateModule.forRoot(),
      ],
      providers: [{ provide: IntegrationsService, useValue: serviceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(UserIntegrationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load integrations on init', () => {
    expect(serviceSpy.listMyIntegrations).toHaveBeenCalled();
    expect(component.integrations().length).toBe(2);
    expect(component.loading()).toBe(false);
  });

  it('should set loading to false on error', () => {
    serviceSpy.listMyIntegrations.mockReturnValue(
      throwError(() => new Error('fail')),
    );
    component.loadIntegrations();
    expect(component.loading()).toBe(false);
  });

  describe('getStatusText()', () => {
    it('should return company token text for global source', () => {
      expect(component.getStatusText(mockIntegrations[0])).toBe(
        'Using: Company token',
      );
    });

    it('should return team token text with name', () => {
      const item: UserIntegration = {
        ...mockIntegrations[0],
        credentialSource: 'team',
        teamName: 'Alpha',
      };
      expect(component.getStatusText(item)).toBe('Using: Team token (Alpha)');
    });

    it('should return team token text without name', () => {
      const item: UserIntegration = {
        ...mockIntegrations[0],
        credentialSource: 'team',
      };
      expect(component.getStatusText(item)).toBe('Using: Team token');
    });

    it('should return personal text', () => {
      const item: UserIntegration = {
        ...mockIntegrations[0],
        credentialSource: 'personal',
      };
      expect(component.getStatusText(item)).toBe('Connected as personal');
    });

    it('should return not connected for none', () => {
      expect(component.getStatusText(mockIntegrations[1])).toBe(
        'Not connected',
      );
    });
  });

  describe('connect()', () => {
    it('should open dialog and call connectIntegration on result', () => {
      const afterClosedSubject = new Subject<any>();
      const dialog = (component as any).dialog as MatDialog;
      jest.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

      component.connect(mockIntegrations[0]);
      afterClosedSubject.next({ token: 'ghp_abc' });

      expect(serviceSpy.connectIntegration).toHaveBeenCalledWith('github', {
        token: 'ghp_abc',
      });
    });

    it('should not call connectIntegration when dialog cancelled', () => {
      const afterClosedSubject = new Subject<any>();
      const dialog = (component as any).dialog as MatDialog;
      jest.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

      component.connect(mockIntegrations[0]);
      afterClosedSubject.next(undefined);

      expect(serviceSpy.connectIntegration).not.toHaveBeenCalled();
    });

    it('should show snackbar on successful connect', () => {
      const snackBar = (component as any).snackBar as MatSnackBar;
      jest.spyOn(snackBar, 'open');
      const afterClosedSubject = new Subject<any>();
      const dialog = (component as any).dialog as MatDialog;
      jest.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

      component.connect(mockIntegrations[0]);
      afterClosedSubject.next({ token: 'ghp_abc' });

      expect(snackBar.open).toHaveBeenCalledWith(
        'Connected successfully',
        'Dismiss',
        expect.any(Object),
      );
    });

    it('should show error snackbar on connect failure', () => {
      serviceSpy.connectIntegration.mockReturnValue(
        throwError(() => ({ error: { message: 'Invalid token' } })),
      );
      const snackBar = (component as any).snackBar as MatSnackBar;
      jest.spyOn(snackBar, 'open');
      const afterClosedSubject = new Subject<any>();
      const dialog = (component as any).dialog as MatDialog;
      jest.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

      component.connect(mockIntegrations[0]);
      afterClosedSubject.next({ token: 'bad' });

      expect(snackBar.open).toHaveBeenCalledWith(
        'Invalid token',
        'Dismiss',
        expect.objectContaining({ panelClass: 'snackbar-error' }),
      );
    });

    it('should reload integrations after successful connect', () => {
      const afterClosedSubject = new Subject<any>();
      const dialog = (component as any).dialog as MatDialog;
      jest.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

      serviceSpy.listMyIntegrations.mockClear();
      component.connect(mockIntegrations[0]);
      afterClosedSubject.next({ token: 'ghp_abc' });

      expect(serviceSpy.listMyIntegrations).toHaveBeenCalled();
    });
  });

  describe('disconnect()', () => {
    beforeEach(() => {
      jest.spyOn(window, 'confirm').mockReturnValue(true);
    });

    afterEach(() => {
      (window.confirm as jest.Mock).mockRestore();
    });

    it('should call disconnectIntegration after confirm', () => {
      component.disconnect(mockIntegrations[0]);
      expect(serviceSpy.disconnectIntegration).toHaveBeenCalledWith('github');
    });

    it('should not call disconnect when confirm is declined', () => {
      (window.confirm as jest.Mock).mockReturnValue(false);
      component.disconnect(mockIntegrations[0]);
      expect(serviceSpy.disconnectIntegration).not.toHaveBeenCalled();
    });

    it('should show snackbar on successful disconnect', () => {
      const snackBar = (component as any).snackBar as MatSnackBar;
      jest.spyOn(snackBar, 'open');
      component.disconnect(mockIntegrations[0]);
      expect(snackBar.open).toHaveBeenCalledWith(
        'Disconnected',
        'Dismiss',
        expect.any(Object),
      );
    });

    it('should show error snackbar on disconnect failure', () => {
      serviceSpy.disconnectIntegration.mockReturnValue(
        throwError(() => ({ error: { message: 'Server error' } })),
      );
      const snackBar = (component as any).snackBar as MatSnackBar;
      jest.spyOn(snackBar, 'open');
      component.disconnect(mockIntegrations[0]);
      expect(snackBar.open).toHaveBeenCalledWith(
        'Server error',
        'Dismiss',
        expect.objectContaining({ panelClass: 'snackbar-error' }),
      );
    });

    it('should reload integrations after successful disconnect', () => {
      serviceSpy.listMyIntegrations.mockClear();
      component.disconnect(mockIntegrations[0]);
      expect(serviceSpy.listMyIntegrations).toHaveBeenCalled();
    });
  });
});
