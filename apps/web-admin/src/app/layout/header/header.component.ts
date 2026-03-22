import { Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdminAuthService } from '../../services/admin-auth.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'tc-admin-header',
  standalone: true,
  imports: [
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  private readonly authService = inject(AdminAuthService);
  readonly themeService = inject(ThemeService);

  readonly showMenuButton = input(false);
  readonly menuToggle = output<void>();

  readonly userEmail = this.authService.userEmail;

  onMenuToggle() {
    this.menuToggle.emit();
  }

  signOut() {
    this.authService.signOut();
  }

  toggleTheme() {
    this.themeService.toggleTheme();
  }
}
