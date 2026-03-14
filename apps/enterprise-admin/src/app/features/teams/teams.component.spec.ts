import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of, Subject } from 'rxjs';
import { TeamsComponent } from './teams.component';
import {
  AdminApiService,
  Team,
  QueryTeamsResponse,
} from '../../services/admin-api.service';

describe('TeamsComponent', () => {
  let component: TeamsComponent;
  let fixture: ComponentFixture<TeamsComponent>;
  let apiSpy: jest.Mocked<Pick<AdminApiService, 'queryTeams' | 'createTeam' | 'deleteTeam'>>;
  let routerSpy: jest.Mocked<Pick<Router, 'navigate'>>;

  const mockTeams: Team[] = [
    { teamId: 't1', name: 'Alpha', memberIds: ['u1', 'u2'], createdAt: '2025-01-01' },
    { teamId: 't2', name: 'Beta', description: 'Second team', createdAt: '2025-02-01' },
  ];

  const mockResponse: QueryTeamsResponse = { teams: mockTeams, total: 2 };

  beforeEach(async () => {
    apiSpy = {
      queryTeams: jest.fn().mockReturnValue(of(mockResponse)),
      createTeam: jest.fn().mockReturnValue(of({ teamId: 't3', name: 'Gamma', createdAt: '2025-03-01' })),
      deleteTeam: jest.fn().mockReturnValue(of({ success: true })),
    };

    routerSpy = { navigate: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [TeamsComponent, NoopAnimationsModule],
      providers: [
        { provide: AdminApiService, useValue: apiSpy },
        { provide: Router, useValue: routerSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TeamsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function getComponentDialog(): MatDialog {
    return (component as any).dialog;
  }

  it('should render teams table', () => {
    expect(component.teams()).toEqual(mockTeams);
    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tr.mat-mdc-row');
    expect(rows.length).toBe(2);
  });

  it('should display team names in the table', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Alpha');
    expect(compiled.textContent).toContain('Beta');
  });

  it('should display member counts', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tr.mat-mdc-row');
    expect(rows[0].textContent).toContain('2');
    expect(rows[1].textContent).toContain('0');
  });

  it('should open create team dialog on button click', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => afterClosedSubject.asObservable() } as any);

    component.openCreateDialog();
    expect(dialog.open).toHaveBeenCalled();
  });

  it('should create team when dialog returns result', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => afterClosedSubject.asObservable() } as any);

    component.openCreateDialog();
    afterClosedSubject.next({ name: 'Gamma', description: 'New team' });
    afterClosedSubject.complete();

    expect(apiSpy.createTeam).toHaveBeenCalledWith({ name: 'Gamma', description: 'New team' });
  });

  it('should not create team when dialog is cancelled', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => afterClosedSubject.asObservable() } as any);

    component.openCreateDialog();
    afterClosedSubject.next(undefined);
    afterClosedSubject.complete();

    expect(apiSpy.createTeam).not.toHaveBeenCalled();
  });

  it('should navigate to team detail on view', () => {
    component.viewTeam(mockTeams[0]);
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/teams', 't1']);
  });

  it('should delete team after confirmation', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => afterClosedSubject.asObservable() } as any);

    component.deleteTeam(mockTeams[0]);
    afterClosedSubject.next(true);

    expect(apiSpy.deleteTeam).toHaveBeenCalledWith('t1');
  });

  it('should not delete team when confirmation is declined', () => {
    const afterClosedSubject = new Subject<any>();
    const dialog = getComponentDialog();
    jest.spyOn(dialog, 'open').mockReturnValue({ afterClosed: () => afterClosedSubject.asObservable() } as any);

    component.deleteTeam(mockTeams[0]);
    afterClosedSubject.next(false);

    expect(apiSpy.deleteTeam).not.toHaveBeenCalled();
  });
});
