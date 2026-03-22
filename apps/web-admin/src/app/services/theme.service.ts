import {
  Injectable,
  signal,
  effect,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ThemeMode = 'dark' | 'light' | 'system';

const THEME_STORAGE_KEY = 'teamclaw-admin-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  /** Current theme mode setting (dark, light, or system) */
  readonly themeMode = signal<ThemeMode>(this.getInitialTheme());

  /** Resolved effective theme (always dark or light) */
  readonly effectiveTheme = signal<'dark' | 'light'>('dark');

  constructor() {
    // Effect to apply theme when mode changes
    effect(() => {
      const mode = this.themeMode();
      const effective = this.resolveEffectiveTheme(mode);
      this.effectiveTheme.set(effective);
      this.applyTheme(effective);
      this.persistTheme(mode);
    });

    // Listen for system preference changes
    if (this.isBrowser) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', () => {
        if (this.themeMode() === 'system') {
          const effective = this.resolveEffectiveTheme('system');
          this.effectiveTheme.set(effective);
          this.applyTheme(effective);
        }
      });
    }
  }

  /** Set theme mode */
  setTheme(mode: ThemeMode): void {
    this.themeMode.set(mode);
  }

  /** Toggle between dark and light */
  toggleTheme(): void {
    const current = this.effectiveTheme();
    this.themeMode.set(current === 'dark' ? 'light' : 'dark');
  }

  private getInitialTheme(): ThemeMode {
    if (!this.isBrowser) return 'dark'; // SSR default

    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    if (stored && ['dark', 'light', 'system'].includes(stored)) {
      return stored;
    }

    // Admin app defaults to dark
    return 'dark';
  }

  private resolveEffectiveTheme(mode: ThemeMode): 'dark' | 'light' {
    if (mode === 'system' && this.isBrowser) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return mode === 'light' ? 'light' : 'dark';
  }

  private applyTheme(theme: 'dark' | 'light'): void {
    if (!this.isBrowser) return;

    const html = document.documentElement;
    html.setAttribute('data-theme', theme);
    html.style.colorScheme = theme;
  }

  private persistTheme(mode: ThemeMode): void {
    if (this.isBrowser) {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    }
  }
}
