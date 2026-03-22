import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  CredentialDialogComponent,
  CredentialDialogData,
} from './credential-dialog.component';

describe('CredentialDialogComponent', () => {
  let component: CredentialDialogComponent;
  let fixture: ComponentFixture<CredentialDialogComponent>;
  let dialogRefSpy: jest.Mocked<Pick<MatDialogRef<any>, 'close'>>;

  const mockData: CredentialDialogData = {
    integrationName: 'GitHub',
    scope: 'global',
    schema: [
      {
        key: 'token',
        label: 'API Token',
        type: 'secret',
        required: true,
        placeholder: 'ghp_...',
      },
      {
        key: 'org',
        label: 'Organization',
        type: 'text',
        required: false,
      },
    ],
  };

  beforeEach(async () => {
    dialogRefSpy = { close: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [CredentialDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: mockData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CredentialDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should inject dialog data', () => {
    expect(component.data.integrationName).toBe('GitHub');
    expect(component.data.schema.length).toBe(2);
  });

  describe('setValue()', () => {
    it('should update values signal', () => {
      component.setValue('token', 'ghp_abc123');
      expect(component.values()).toEqual({ token: 'ghp_abc123' });
    });

    it('should merge multiple values', () => {
      component.setValue('token', 'ghp_abc');
      component.setValue('org', 'my-org');
      expect(component.values()).toEqual({ token: 'ghp_abc', org: 'my-org' });
    });
  });

  describe('isValid()', () => {
    it('should return false when required fields are empty', () => {
      expect(component.isValid()).toBe(false);
    });

    it('should return false when required field is whitespace', () => {
      component.setValue('token', '   ');
      expect(component.isValid()).toBe(false);
    });

    it('should return true when all required fields are filled', () => {
      component.setValue('token', 'ghp_abc');
      expect(component.isValid()).toBe(true);
    });

    it('should not require optional fields', () => {
      component.setValue('token', 'ghp_abc');
      // org is optional, so isValid should be true without it
      expect(component.isValid()).toBe(true);
    });
  });

  describe('save()', () => {
    it('should close dialog with current values', () => {
      component.setValue('token', 'ghp_abc');
      component.setValue('org', 'my-org');
      component.save();
      expect(dialogRefSpy.close).toHaveBeenCalledWith({
        token: 'ghp_abc',
        org: 'my-org',
      });
    });
  });
});
