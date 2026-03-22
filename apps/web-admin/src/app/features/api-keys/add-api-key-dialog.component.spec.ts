import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { PROVIDER_OPTIONS } from '../../services/admin-api.service';
import { AddApiKeyDialogComponent } from './add-api-key-dialog.component';

describe('AddApiKeyDialogComponent', () => {
  let component: AddApiKeyDialogComponent;
  let fixture: ComponentFixture<AddApiKeyDialogComponent>;
  let dialogRefSpy: jest.Mocked<
    Pick<MatDialogRef<AddApiKeyDialogComponent>, 'close'>
  >;

  beforeEach(async () => {
    dialogRefSpy = { close: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [AddApiKeyDialogComponent, NoopAnimationsModule],
      providers: [{ provide: MatDialogRef, useValue: dialogRefSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(AddApiKeyDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display dialog title', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Add API Key');
  });

  it('should expose PROVIDER_OPTIONS', () => {
    expect(component.providerOptions).toBe(PROVIDER_OPTIONS);
    expect(component.providerOptions.length).toBeGreaterThan(0);
  });

  it('should close dialog with provider, authType and key on submit for apiKey type', () => {
    // Select the anthropic provider (apiKey type)
    component.selectedId = 'anthropic';
    component.onProviderChange();
    component.credential = 'sk-ant-secret123';
    component.submit();
    expect(dialogRefSpy.close).toHaveBeenCalledWith({
      provider: 'anthropic',
      authType: 'apiKey',
      key: 'sk-ant-secret123',
    });
  });

  it('should close dialog with provider, authType and token on submit for oauthToken type', () => {
    // Select the anthropic-token provider (oauthToken type)
    component.selectedId = 'anthropic-token';
    component.onProviderChange();
    component.credential = 'some-oauth-token';
    component.submit();
    expect(dialogRefSpy.close).toHaveBeenCalledWith({
      provider: 'anthropic',
      authType: 'oauthToken',
      token: 'some-oauth-token',
    });
  });

  it('should not submit when no provider selected', () => {
    component.selectedId = '';
    component.credential = 'some-key';
    component.submit();
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
  });

  it('should clear credential on provider change', () => {
    component.selectedId = 'anthropic';
    component.credential = 'old-key';
    component.onProviderChange();
    expect(component.credential).toBe('');
  });

  it('should set selectedOption on provider change', () => {
    component.selectedId = 'openai';
    component.onProviderChange();
    expect(component.selectedOption).toBeDefined();
    expect(component.selectedOption!.id).toBe('openai');
    expect(component.selectedOption!.effectiveId).toBe('openai');
    expect(component.selectedOption!.authType).toBe('apiKey');
  });

  it('should map effectiveId correctly for variant providers', () => {
    component.selectedId = 'openai-codex';
    component.onProviderChange();
    expect(component.selectedOption!.effectiveId).toBe('openai');
  });
});
