import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { RouterModule } from '@angular/router';

describe('AppComponent', () => {
  const setup = async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, RouterModule.forRoot([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    return { fixture, component };
  };

  it('should create the component', async () => {
    const { component } = await setup();
    expect(component).toBeTruthy();
  });

  it('should render router-outlet', async () => {
    const { fixture } = await setup();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const outlet = el.querySelector('router-outlet');
    expect(outlet).toBeTruthy();
  });
});
