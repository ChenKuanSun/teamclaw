import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { Component } from '@angular/core';
import { of } from 'rxjs';
import { TeamDetailComponent } from './team-detail.component';
import {
  AdminApiService,
  Team,
  AdminUser,
} from '../../services/admin-api.service';

describe('TeamDetailComponent', () => {
  let component: TeamDetailComponent;
  let fixture: ComponentFixture<TestHostComponent>;
  let apiSpy: jest.Mocked<Pick<AdminApiService, 'getTeam' | 'getUser' | 'updateTeam'>>;
  let routerSpy: jest.Mocked<Pick<Router, 'navigate'>>;

  const mockTeam: Team = {
    teamId: 't1',
    name: 'Alpha',
    description: 'Alpha team',
    memberIds: ['u1', 'u2'],
    createdAt: '2025-01-01',
  };

  const mockMembers: AdminUser[] = [
    { userId: 'u1', email: 'alice@test.com', status: 'active', createdAt: '2025-01-01' },
    { userId: 'u2', email: 'bob@test.com', status: 'active', createdAt: '2025-01-02' },
  ];

  @Component({
    standalone: true,
    imports: [TeamDetailComponent],
    template: `<tc-team-detail [teamId]="teamId" />`,
  })
  class TestHostComponent {
    teamId = 't1';
  }

  beforeEach(async () => {
    apiSpy = {
      getTeam: jest.fn().mockReturnValue(of(mockTeam)),
      getUser: jest.fn().mockImplementation((userId: string) => {
        const user = mockMembers.find((m) => m.userId === userId);
        return of(user!);
      }),
      updateTeam: jest.fn().mockReturnValue(of(mockTeam)),
    };

    routerSpy = { navigate: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [TestHostComponent, NoopAnimationsModule],
      providers: [
        { provide: AdminApiService, useValue: apiSpy },
        { provide: Router, useValue: routerSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    component = fixture.debugElement.children[0].componentInstance;
    fixture.detectChanges();
  });

  it('should load team info', () => {
    expect(apiSpy.getTeam).toHaveBeenCalledWith('t1');
    expect(component.team()).toEqual(mockTeam);
  });

  it('should show team name', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Alpha');
  });

  it('should show team description', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Alpha team');
  });

  it('should load and list members', () => {
    expect(apiSpy.getUser).toHaveBeenCalledWith('u1');
    expect(apiSpy.getUser).toHaveBeenCalledWith('u2');
    expect(component.members().length).toBe(2);
  });

  it('should display member emails', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('alice@test.com');
    expect(compiled.textContent).toContain('bob@test.com');
  });

  it('should toggle editing mode', () => {
    expect(component.editing()).toBe(false);
    component.toggleEdit();
    expect(component.editing()).toBe(true);
    expect(component.editName).toBe('Alpha');
    expect(component.editDescription).toBe('Alpha team');
  });

  it('should save edits via API', () => {
    component.toggleEdit();
    component.editName = 'Alpha Updated';
    component.editDescription = 'Updated description';
    component.saveEdit();

    expect(apiSpy.updateTeam).toHaveBeenCalledWith('t1', {
      name: 'Alpha Updated',
      description: 'Updated description',
    });
  });

  it('should remove member after confirmation', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    component.removeMember(mockMembers[0]);

    expect(apiSpy.updateTeam).toHaveBeenCalledWith('t1', {
      memberIds: ['u2'],
    });
  });

  it('should not remove member when confirmation is declined', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    component.removeMember(mockMembers[0]);
    expect(apiSpy.updateTeam).not.toHaveBeenCalled();
  });

  it('should navigate back to teams list', () => {
    component.goBack();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/teams']);
  });
});
