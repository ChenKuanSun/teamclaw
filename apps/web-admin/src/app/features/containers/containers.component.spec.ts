import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { ContainersComponent } from './containers.component';
import {
  AdminApiService,
  Container,
  QueryContainersResponse,
} from '../../services/admin-api.service';

describe('ContainersComponent', () => {
  let component: ContainersComponent;
  let fixture: ComponentFixture<ContainersComponent>;
  let apiSpy: jest.Mocked<Pick<AdminApiService, 'queryContainers' | 'startContainer' | 'stopContainer'>>;

  const mockContainers: Container[] = [
    { userId: 'u1', status: 'RUNNING', taskArn: 'arn:task/1' },
    { userId: 'u2', status: 'STOPPED' },
    { userId: 'u3', status: 'PROVISIONING' },
  ];

  const mockResponse: QueryContainersResponse = { containers: mockContainers, total: 3 };

  beforeEach(async () => {
    apiSpy = {
      queryContainers: jest.fn().mockReturnValue(of(mockResponse)),
      startContainer: jest.fn().mockReturnValue(of({})),
      stopContainer: jest.fn().mockReturnValue(of({})),
    };

    await TestBed.configureTestingModule({
      imports: [ContainersComponent, NoopAnimationsModule],
      providers: [
        { provide: AdminApiService, useValue: apiSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ContainersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should show container status table', () => {
    expect(component.containers()).toEqual(mockContainers);
    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tr.mat-mdc-row');
    expect(rows.length).toBe(3);
  });

  it('should display userId and status', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('u1');
    expect(compiled.textContent).toContain('RUNNING');
    expect(compiled.textContent).toContain('STOPPED');
  });

  it('should display task ARN or N/A', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('arn:task/1');
    expect(compiled.textContent).toContain('N/A');
  });

  it('should call startContainer API for stopped containers', () => {
    component.startContainer(mockContainers[1]);
    expect(apiSpy.startContainer).toHaveBeenCalledWith('u2');
    expect(component.actionLoading()).toBe(false); // resolved synchronously
  });

  it('should call stopContainer API for running containers', () => {
    component.stopContainer(mockContainers[0]);
    expect(apiSpy.stopContainer).toHaveBeenCalledWith('u1');
  });

  it('should reload containers after start/stop', () => {
    apiSpy.queryContainers.mockClear();
    component.startContainer(mockContainers[1]);
    // loadContainers called after success
    expect(apiSpy.queryContainers).toHaveBeenCalled();
  });

  it('should filter by status when statusFilter is set', () => {
    apiSpy.queryContainers.mockClear();
    component.statusFilter = 'RUNNING';
    component.loadContainers();
    expect(apiSpy.queryContainers).toHaveBeenCalledWith({ status: 'RUNNING' });
  });

  it('should query without status when filter is empty', () => {
    apiSpy.queryContainers.mockClear();
    component.statusFilter = '';
    component.loadContainers();
    expect(apiSpy.queryContainers).toHaveBeenCalledWith({});
  });

  it('should handle error on load', () => {
    apiSpy.queryContainers.mockReturnValue(throwError(() => new Error('fail')));
    component.loadContainers();
    expect(component.loading()).toBe(false);
  });
});
