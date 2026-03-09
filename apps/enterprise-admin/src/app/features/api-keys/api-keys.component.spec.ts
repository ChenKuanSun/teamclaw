import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { of, Subject } from 'rxjs';
import { ApiKeysComponent } from './api-keys.component';
import {
  AdminApiService,
  ApiKey,
  KeyUsageStats,
} from '../../services/admin-api.service';

describe('ApiKeysComponent', () => {
  let component: ApiKeysComponent;
  let fixture: ComponentFixture<ApiKeysComponent>;
  let apiSpy: jest.Mocked<Pick<AdminApiService, 'getApiKeys' | 'addApiKey' | 'removeApiKey' | 'getKeyUsageStats'>>;

  const mockKeys: ApiKey[] = [
    { keyId: 'k1', provider: 'anthropic', maskedKey: 'sk-ant-***xyz', createdAt: '2025-01-01' },
    { keyId: 'k2', provider: 'openai', maskedKey: 'sk-***abc', createdAt: '2025-02-01' },
  ];

  const mockUsage: KeyUsageStats = {
    totalRequests: 1500,
    byProvider: [
      { provider: 'anthropic', requests: 1000, cost: 25.50 },
      { provider: 'openai', requests: 500, cost: 12.00 },
    ],
  };

  beforeEach(async () => {
    apiSpy = {
      getApiKeys: jest.fn().mockReturnValue(of({ keys: mockKeys })),
      addApiKey: jest.fn().mockReturnValue(of({ keyId: 'k3', provider: 'google', maskedKey: 'goog-***', createdAt: '' })),
      removeApiKey: jest.fn().mockReturnValue(of({ success: true })),
      getKeyUsageStats: jest.fn().mockReturnValue(of(mockUsage)),
    };

    await TestBed.configureTestingModule({
      imports: [ApiKeysComponent, NoopAnimationsModule],
      providers: [
        { provide: AdminApiService, useValue: apiSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ApiKeysComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function getComponentDialog(): MatDialog {
    return (component as any).dialog;
  }

  it('should list API keys', () => {
    expect(component.keys()).toEqual(mockKeys);
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
    jest.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => afterClosedSubject.asObservable() } as any);

    component.openAddDialog();
    expect(dialog.open).toHaveBeenCalled();
  });

  it('should add key when dialog returns result', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => afterClosedSubject.asObservable() } as any);

    component.openAddDialog();
    afterClosedSubject.next({ provider: 'google', key: 'goog-secret' });

    expect(apiSpy.addApiKey).toHaveBeenCalledWith({ provider: 'google', key: 'goog-secret' });
  });

  it('should not add key when dialog is cancelled', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => afterClosedSubject.asObservable() } as any);

    component.openAddDialog();
    afterClosedSubject.next(undefined);

    expect(apiSpy.addApiKey).not.toHaveBeenCalled();
  });

  it('should remove key after confirmation', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    component.removeKey(mockKeys[0]);
    expect(apiSpy.removeApiKey).toHaveBeenCalledWith('k1');
  });

  it('should not remove key when confirmation is declined', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    component.removeKey(mockKeys[0]);
    expect(apiSpy.removeApiKey).not.toHaveBeenCalled();
  });

  it('should reload keys and usage after adding a key', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => afterClosedSubject.asObservable() } as any);

    apiSpy.getApiKeys.mockClear();
    apiSpy.getKeyUsageStats.mockClear();

    component.openAddDialog();
    afterClosedSubject.next({ provider: 'google', key: 'goog-secret' });

    expect(apiSpy.getApiKeys).toHaveBeenCalled();
    expect(apiSpy.getKeyUsageStats).toHaveBeenCalled();
  });
});
