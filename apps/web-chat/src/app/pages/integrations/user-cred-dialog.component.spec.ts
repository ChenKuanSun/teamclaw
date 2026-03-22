import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { UserCredDialogComponent } from './user-cred-dialog.component';

describe('UserCredDialogComponent', () => {
  let component: UserCredDialogComponent;
  let fixture: ComponentFixture<UserCredDialogComponent>;
  let dialogRefSpy: jest.Mocked<Pick<MatDialogRef<any>, 'close'>>;

  const mockData = {
    integrationName: 'GitHub',
    schema: [
      {
        key: 'token',
        label: 'API Token',
        type: 'secret' as const,
        required: true,
        placeholder: 'ghp_...',
      },
      {
        key: 'org',
        label: 'Organization',
        type: 'text' as const,
        required: false,
      },
    ],
  };

  beforeEach(async () => {
    dialogRefSpy = { close: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [
        UserCredDialogComponent,
        NoopAnimationsModule,
        TranslateModule.forRoot(),
      ],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: mockData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserCredDialogComponent);
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
      expect(component.isValid()).toBe(true);
    });
  });

  describe('isValid() with no schema', () => {
    it('should return true when schema is undefined', () => {
      (component.data as any).schema = undefined;
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
