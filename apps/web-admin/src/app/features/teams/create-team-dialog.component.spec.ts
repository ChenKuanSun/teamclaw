import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialogRef } from '@angular/material/dialog';
import { CreateTeamDialogComponent } from './create-team-dialog.component';

describe('CreateTeamDialogComponent', () => {
  let component: CreateTeamDialogComponent;
  let fixture: ComponentFixture<CreateTeamDialogComponent>;
  let dialogRefSpy: jest.Mocked<Pick<MatDialogRef<CreateTeamDialogComponent>, 'close'>>;

  beforeEach(async () => {
    dialogRefSpy = { close: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [CreateTeamDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateTeamDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display dialog title', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Create Team');
  });

  it('should close dialog with form data on submit', () => {
    component.name = 'New Team';
    component.description = 'A description';
    component.submit();
    expect(dialogRefSpy.close).toHaveBeenCalledWith({
      name: 'New Team',
      description: 'A description',
    });
  });
});
