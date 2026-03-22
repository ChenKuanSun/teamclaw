import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  route: string;
}

const ADMIN_MENU_ITEMS: MenuItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    route: '/dashboard',
  },
  { id: 'users', label: 'Users', icon: 'people', route: '/users' },
  { id: 'teams', label: 'Teams', icon: 'groups', route: '/teams' },
  { id: 'containers', label: 'Containers', icon: 'dns', route: '/containers' },
  { id: 'config', label: 'Config', icon: 'settings', route: '/config' },
  { id: 'api-keys', label: 'API Keys', icon: 'vpn_key', route: '/api-keys' },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: 'extension',
    route: '/integrations',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: 'insights',
    route: '/analytics',
  },
];

@Component({
  selector: 'tc-admin-side-nav',
  standalone: true,
  imports: [MatListModule, MatIconModule, RouterLink, RouterLinkActive],
  templateUrl: './side-nav.component.html',
  styleUrl: './side-nav.component.scss',
})
export class SideNavComponent {
  readonly menuItems = ADMIN_MENU_ITEMS;
}
