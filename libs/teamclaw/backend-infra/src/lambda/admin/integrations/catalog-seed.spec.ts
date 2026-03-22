import {
  INTEGRATION_CATALOG,
  getCatalogEntry,
  getEnvVarPrefix,
} from './catalog-seed';

describe('catalog-seed', () => {
  describe('data integrity', () => {
    it('should have all unique integrationIds', () => {
      const ids = INTEGRATION_CATALOG.map(d => d.integrationId);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should have all unique envVarPrefixes', () => {
      const prefixes = INTEGRATION_CATALOG.map(d => d.envVarPrefix);
      expect(new Set(prefixes).size).toBe(prefixes.length);
    });

    it('should have valid categories for every entry', () => {
      const validCategories = [
        'productivity',
        'messaging',
        'developer-tools',
        'project-management',
      ];
      for (const entry of INTEGRATION_CATALOG) {
        expect(validCategories).toContain(entry.category);
      }
    });

    it('should have non-empty credentialSchema for every entry', () => {
      for (const entry of INTEGRATION_CATALOG) {
        expect(entry.credentialSchema.length).toBeGreaterThan(0);
        for (const field of entry.credentialSchema) {
          expect(field.key).toBeTruthy();
          expect(field.label).toBeTruthy();
          expect(['secret', 'text']).toContain(field.type);
          expect(typeof field.required).toBe('boolean');
        }
      }
    });

    it('should have non-empty displayName and description for every entry', () => {
      for (const entry of INTEGRATION_CATALOG) {
        expect(entry.displayName.length).toBeGreaterThan(0);
        expect(entry.description.length).toBeGreaterThan(0);
        expect(entry.icon.length).toBeGreaterThan(0);
      }
    });

    it('should have unique credential keys within each entry', () => {
      for (const entry of INTEGRATION_CATALOG) {
        const keys = entry.credentialSchema.map(f => f.key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    });
  });

  describe('getCatalogEntry', () => {
    it('should return the entry for a known integrationId', () => {
      const entry = getCatalogEntry('github');
      expect(entry).toBeDefined();
      expect(entry!.displayName).toBe('GitHub');
    });

    it('should return undefined for an unknown integrationId', () => {
      expect(getCatalogEntry('unknown')).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(getCatalogEntry('')).toBeUndefined();
    });
  });

  describe('getEnvVarPrefix', () => {
    it('should return the prefix for a known integrationId', () => {
      expect(getEnvVarPrefix('github')).toBe('GITHUB');
      expect(getEnvVarPrefix('slack')).toBe('SLACK');
      expect(getEnvVarPrefix('notion')).toBe('NOTION');
    });

    it('should fallback to uppercased integrationId for unknown', () => {
      expect(getEnvVarPrefix('unknown')).toBe('UNKNOWN');
    });

    it('should fallback to uppercased for empty string', () => {
      expect(getEnvVarPrefix('')).toBe('');
    });
  });
});
