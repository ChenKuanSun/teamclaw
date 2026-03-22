import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, Subject } from 'rxjs';
import {
  AdminApiService,
  KeyUsageStats,
  ProvidersResponse,
} from '../../services/admin-api.service';
import { ApiKeysComponent } from './api-keys.component';

describe('ApiKeysComponent', () => {
  let component: ApiKeysComponent;
  let fixture: ComponentFixture<ApiKeysComponent>;
  let apiSpy: jest.Mocked<
    Pick<
      AdminApiService,
      'getApiKeys' | 'addApiKey' | 'removeApiKey' | 'getKeyUsageStats'
    >
  >;

  const mockProvidersResponse: ProvidersResponse = {
    providers: {
      anthropic: {
        authType: 'apiKey',
        keys: [{ keyId: 'k1', masked: 'sk-ant-***xyz' }],
      },
      openai: {
        authType: 'oauthToken',
        hasToken: true,
        expiresAt: undefined,
      },
    },
  };

  const mockUsage: KeyUsageStats = {
    totalRequests: 1500,
    byProvider: [
      { provider: 'anthropic', requests: 1000, cost: 25.5 },
      { provider: 'openai', requests: 500, cost: 12.0 },
    ],
  };

  beforeEach(async () => {
    apiSpy = {
      getApiKeys: jest.fn().mockReturnValue(of(mockProvidersResponse)),
      addApiKey: jest
        .fn()
        .mockReturnValue(of({ message: 'ok', provider: 'google' })),
      removeApiKey: jest.fn().mockReturnValue(of({ success: true })),
      getKeyUsageStats: jest.fn().mockReturnValue(of(mockUsage)),
    };

    await TestBed.configureTestingModule({
      imports: [ApiKeysComponent, NoopAnimationsModule],
      providers: [{ provide: AdminApiService, useValue: apiSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(ApiKeysComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function getComponentDialog(): MatDialog {
    return (component as any).dialog;
  }

  it('should list provider rows', () => {
    const rows = component.rows();
    expect(rows.length).toBe(2);
    expect(rows[0].provider).toBe('anthropic');
    expect(rows[0].authType).toBe('apiKey');
    expect(rows[0].display).toBe('sk-ant-***xyz');
    expect(rows[1].provider).toBe('openai');
    expect(rows[1].authType).toBe('oauthToken');
  });

  it('should show provider names in table', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('anthropic');
    expect(compiled.textContent).toContain('openai');
    expect(compiled.textContent).toContain('sk-ant-***xyz');
  });

  it('should show key table rows', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('table.full-width tr.mat-mdc-row');
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('should load and display usage stats', () => {
    expect(component.usageStats()).toEqual(mockUsage);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('1,500');
  });

  it('should open add key dialog', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest
      .spyOn(dialog, 'open')
      .mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

    component.openAddDialog();
    expect(dialog.open).toHaveBeenCalled();
  });

  it('should add key when dialog returns result', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest
      .spyOn(dialog, 'open')
      .mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

    component.openAddDialog();
    afterClosedSubject.next({
      provider: 'google',
      authType: 'apiKey',
      key: 'goog-secret',
    });

    expect(apiSpy.addApiKey).toHaveBeenCalledWith({
      provider: 'google',
      authType: 'apiKey',
      key: 'goog-secret',
    });
  });

  it('should not add key when dialog is cancelled', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest
      .spyOn(dialog, 'open')
      .mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

    component.openAddDialog();
    afterClosedSubject.next(undefined);

    expect(apiSpy.addApiKey).not.toHaveBeenCalled();
  });

  it('should remove key after confirmation', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest
      .spyOn(dialog, 'open')
      .mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

    // removeKey takes a ProviderRow
    const row = component.rows()[0]; // anthropic apiKey row
    component.removeKey(row);
    afterClosedSubject.next(true);

    expect(apiSpy.removeApiKey).toHaveBeenCalledWith('anthropic', 'k1');
  });

  it('should not remove key when confirmation is declined', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest
      .spyOn(dialog, 'open')
      .mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

    const row = component.rows()[0];
    component.removeKey(row);
    afterClosedSubject.next(false);

    expect(apiSpy.removeApiKey).not.toHaveBeenCalled();
  });

  it('should reload keys after adding a key', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest
      .spyOn(dialog, 'open')
      .mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

    apiSpy.getApiKeys.mockClear();

    component.openAddDialog();
    afterClosedSubject.next({
      provider: 'google',
      authType: 'apiKey',
      key: 'goog-secret',
    });

    expect(apiSpy.getApiKeys).toHaveBeenCalled();
  });

  it('should show snackbar on successful add', () => {
    const snackBar = (component as any).snackBar as MatSnackBar;
    jest.spyOn(snackBar, 'open');

    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest
      .spyOn(dialog, 'open')
      .mockReturnValue({
        afterClosed: () => afterClosedSubject.asObservable(),
      } as any);

    component.openAddDialog();
    afterClosedSubject.next({
      provider: 'google',
      authType: 'apiKey',
      key: 'goog-secret',
    });

    expect(snackBar.open).toHaveBeenCalledWith(
      'Credential added successfully',
      'Dismiss',
      expect.any(Object),
    );
  });

  it('should format OAuth display correctly', () => {
    const oauthRow = component.rows().find(r => r.authType === 'oauthToken');
    expect(oauthRow).toBeTruthy();
    expect(oauthRow!.display).toContain('token configured');
  });
});
