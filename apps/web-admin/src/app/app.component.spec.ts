import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
describe('AppComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }
  it('should create the app', () => {
    const { component } = setup();
    expect(component).toBeTruthy();
  });
  it('should have router-outlet', () => {
    const { fixture } = setup();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});
