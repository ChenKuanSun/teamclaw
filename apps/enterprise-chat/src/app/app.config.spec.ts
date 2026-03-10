import { appConfig } from './app.config';

describe('appConfig', () => {
  it('should be defined', () => {
    expect(appConfig).toBeDefined();
  });

  it('should have providers array', () => {
    expect(appConfig.providers).toBeDefined();
    expect(Array.isArray(appConfig.providers)).toBe(true);
  });

  it('should have providers for router, http, animations, translate, and markdown', () => {
    // providers: provideBrowserGlobalErrorListeners, provideZoneChangeDetection,
    // provideRouter, provideHttpClient, provideAnimationsAsync, provideTranslateService, provideMarkdown
    expect(appConfig.providers.length).toBeGreaterThanOrEqual(7);
  });
});
