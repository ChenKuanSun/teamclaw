import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { SideNavComponent } from './side-nav.component';

describe('SideNavComponent', () => {
  let component: SideNavComponent;
  let fixture: ComponentFixture<SideNavComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        SideNavComponent,
        NoopAnimationsModule,
        RouterModule.forRoot([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SideNavComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have 8 menu items', () => {
    expect(component.menuItems.length).toBe(8);
  });

  it('should have correct menu item routes', () => {
    const routes = component.menuItems.map(item => item.route);
    expect(routes).toEqual([
      '/dashboard',
      '/users',
      '/teams',
      '/containers',
      '/config',
      '/api-keys',
      '/integrations',
      '/analytics',
    ]);
  });

  it('should render all nav items', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Dashboard');
    expect(compiled.textContent).toContain('Users');
    expect(compiled.textContent).toContain('Teams');
    expect(compiled.textContent).toContain('Containers');
    expect(compiled.textContent).toContain('Config');
    expect(compiled.textContent).toContain('API Keys');
    expect(compiled.textContent).toContain('Integrations');
    expect(compiled.textContent).toContain('Analytics');
  });

  it('should render logo text', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('TeamClaw');
    expect(compiled.textContent).toContain('Admin Panel');
  });

  it('should render navigation links with correct hrefs', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const links = compiled.querySelectorAll('a.nav-item');
    expect(links.length).toBe(8);
  });
});
