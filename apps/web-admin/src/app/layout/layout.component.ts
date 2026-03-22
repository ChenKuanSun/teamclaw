import {
  Component,
  computed,
  HostListener,
  signal,
  viewChild,
} from '@angular/core';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header/header.component';
import { SideNavComponent } from './side-nav/side-nav.component';

@Component({
  selector: 'tc-admin-layout',
  standalone: true,
  imports: [MatSidenavModule, RouterOutlet, HeaderComponent, SideNavComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent {
  readonly isSmallDevice = signal(window.innerWidth < 768);
  readonly sidenavOpened = computed(() => !this.isSmallDevice());
  readonly sidenavMode = computed(() =>
    this.isSmallDevice() ? 'over' : 'side'
  );

  readonly sidenav = viewChild<MatSidenav>('sidenav');

  @HostListener('window:resize')
  onResize() {
    this.isSmallDevice.set(window.innerWidth < 768);
  }

  toggleSidenav() {
    this.sidenav()?.toggle();
  }
}
