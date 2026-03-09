import { appConfig } from './app.config';

describe('appConfig', () => {
  it('should be defined', () => {
    expect(appConfig).toBeDefined();
  });

  it('should have providers array', () => {
    expect(appConfig.providers).toBeDefined();
    expect(Array.isArray(appConfig.providers)).toBe(true);
  });

  it('should have at least router and animation providers', () => {
    // providers array includes provideBrowserGlobalErrorListeners, provideRouter, provideAnimationsAsync
    expect(appConfig.providers.length).toBeGreaterThanOrEqual(3);
  });
});
