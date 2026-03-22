import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ConfigAddDialogComponent } from './config-add-dialog.component';

describe('ConfigAddDialogComponent', () => {
  let component: ConfigAddDialogComponent;
  let fixture: ComponentFixture<ConfigAddDialogComponent>;
  let dialogRefSpy: jest.Mocked<Pick<MatDialogRef<any>, 'close'>>;

  beforeEach(async () => {
    dialogRefSpy = { close: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [ConfigAddDialogComponent, NoopAnimationsModule],
      providers: [{ provide: MatDialogRef, useValue: dialogRefSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfigAddDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty key and value signals', () => {
    expect(component.key()).toBe('');
    expect(component.value()).toBe('');
  });

  describe('save()', () => {
    it('should close dialog with trimmed key and value', () => {
      component.key.set('  MY_KEY  ');
      component.value.set('my-value');
      component.save();
      expect(dialogRefSpy.close).toHaveBeenCalledWith({
        configKey: 'MY_KEY',
        value: 'my-value',
      });
    });

    it('should close dialog with empty strings when no input', () => {
      component.save();
      expect(dialogRefSpy.close).toHaveBeenCalledWith({
        configKey: '',
        value: '',
      });
    });
  });
});
