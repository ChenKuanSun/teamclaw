import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'tc-header',
  standalone: true,
  imports: [
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  readonly authService = inject(AuthService);
  readonly router = inject(Router);

  readonly currentPageLabel = computed(() => {
    const route = this.router.url.split('/')[1] || 'chat';
    return route.charAt(0).toUpperCase() + route.slice(1);
  });

  signOut() {
    this.authService.signOut();
  }
}
