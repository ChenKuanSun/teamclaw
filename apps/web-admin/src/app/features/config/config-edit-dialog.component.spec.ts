import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ConfigEditDialogComponent, ConfigEditDialogData } from './config-edit-dialog.component';

describe('ConfigEditDialogComponent', () => {
  let component: ConfigEditDialogComponent;
  let fixture: ComponentFixture<ConfigEditDialogComponent>;
  let dialogRefSpy: jest.Mocked<Pick<MatDialogRef<ConfigEditDialogComponent>, 'close'>>;

  const mockData: ConfigEditDialogData = {
    configKey: 'MAX_TOKENS',
    value: '4096',
    isLargeText: false,
  };

  beforeEach(async () => {
    dialogRefSpy = { close: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [ConfigEditDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: mockData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfigEditDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize value from dialog data', () => {
    expect(component.value).toBe('4096');
  });

  it('should display dialog title', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Edit Config');
  });

  it('should close dialog with updated value on save', () => {
    component.value = '8192';
    component.save();
    expect(dialogRefSpy.close).toHaveBeenCalledWith({
      configKey: 'MAX_TOKENS',
      value: '8192',
    });
  });
});
