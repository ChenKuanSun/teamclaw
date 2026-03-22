import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    localStorage.clear();
    // Reset document state
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';

    // Mock window.matchMedia for jsdom
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  function createService(platformId = 'browser') {
    TestBed.configureTestingModule({
      providers: [ThemeService, { provide: PLATFORM_ID, useValue: platformId }],
    });
    service = TestBed.inject(ThemeService);
    // Flush effect
    TestBed.flushEffects();
  }

  describe('browser platform', () => {
    beforeEach(() => createService('browser'));

    it('should create', () => {
      expect(service).toBeTruthy();
    });

    it('should default to dark theme', () => {
      expect(service.themeMode()).toBe('dark');
      expect(service.effectiveTheme()).toBe('dark');
    });

    it('should apply theme to document', () => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('should persist theme to localStorage', () => {
      expect(localStorage.getItem('teamclaw-admin-theme')).toBe('dark');
    });

    describe('setTheme()', () => {
      it('should switch to light theme', () => {
        service.setTheme('light');
        TestBed.flushEffects();
        expect(service.themeMode()).toBe('light');
        expect(service.effectiveTheme()).toBe('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe(
          'light',
        );
      });

      it('should persist selected theme', () => {
        service.setTheme('light');
        TestBed.flushEffects();
        expect(localStorage.getItem('teamclaw-admin-theme')).toBe('light');
      });
    });

    describe('toggleTheme()', () => {
      it('should toggle from dark to light', () => {
        service.toggleTheme();
        TestBed.flushEffects();
        expect(service.themeMode()).toBe('light');
      });

      it('should toggle from light to dark', () => {
        service.setTheme('light');
        TestBed.flushEffects();
        service.toggleTheme();
        TestBed.flushEffects();
        expect(service.themeMode()).toBe('dark');
      });
    });
  });

  describe('stored theme', () => {
    it('should restore light theme from localStorage', () => {
      localStorage.setItem('teamclaw-admin-theme', 'light');
      createService('browser');
      expect(service.themeMode()).toBe('light');
      expect(service.effectiveTheme()).toBe('light');
    });

    it('should restore system theme from localStorage', () => {
      localStorage.setItem('teamclaw-admin-theme', 'system');
      createService('browser');
      expect(service.themeMode()).toBe('system');
    });

    it('should default to dark for invalid stored value', () => {
      localStorage.setItem('teamclaw-admin-theme', 'invalid');
      createService('browser');
      expect(service.themeMode()).toBe('dark');
    });
  });

  describe('server platform', () => {
    beforeEach(() => createService('server'));

    it('should default to dark on server', () => {
      expect(service.themeMode()).toBe('dark');
      expect(service.effectiveTheme()).toBe('dark');
    });
  });
});
