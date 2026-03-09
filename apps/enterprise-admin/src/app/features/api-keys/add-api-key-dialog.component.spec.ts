import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialogRef } from '@angular/material/dialog';
import { AddApiKeyDialogComponent } from './add-api-key-dialog.component';

describe('AddApiKeyDialogComponent', () => {
  let component: AddApiKeyDialogComponent;
  let fixture: ComponentFixture<AddApiKeyDialogComponent>;
  let dialogRefSpy: jest.Mocked<Pick<MatDialogRef<AddApiKeyDialogComponent>, 'close'>>;

  beforeEach(async () => {
    dialogRefSpy = { close: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [AddApiKeyDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
      ],
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

  it('should close dialog with provider and key on submit', () => {
    component.provider = 'anthropic';
    component.key = 'sk-ant-secret123';
    component.submit();
    expect(dialogRefSpy.close).toHaveBeenCalledWith({
      provider: 'anthropic',
      key: 'sk-ant-secret123',
    });
  });
});
