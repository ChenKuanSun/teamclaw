import { parseSecrets, serializeSecrets, hasAnyCredentials, type ProvidersSecret } from './secrets-format';

describe('secrets-format', () => {
  describe('parseSecrets', () => {
    it('parses new format as-is', () => {
      const input = JSON.stringify({
        providers: {
          anthropic: { authType: 'apiKey', keys: ['sk-ant-1'] },
        },
      });
      const result = parseSecrets(input);
      expect(result.providers['anthropic']).toEqual({ authType: 'apiKey', keys: ['sk-ant-1'] });
    });

    it('migrates old format to new format', () => {
      const input = JSON.stringify({
        anthropic: ['sk-ant-1', 'sk-ant-2'],
        openai: ['sk-oai-1'],
      });
      const result = parseSecrets(input);
      expect(result.providers['anthropic']).toEqual({ authType: 'apiKey', keys: ['sk-ant-1', 'sk-ant-2'] });
      expect(result.providers['openai']).toEqual({ authType: 'apiKey', keys: ['sk-oai-1'] });
    });

    it('handles empty string', () => {
      expect(parseSecrets('')).toEqual({ providers: {} });
    });

    it('handles undefined', () => {
      expect(parseSecrets(undefined)).toEqual({ providers: {} });
    });

    it('handles empty object', () => {
      expect(parseSecrets('{}')).toEqual({ providers: {} });
    });
  });

  describe('serializeSecrets', () => {
    it('serializes to JSON string', () => {
      const secret: ProvidersSecret = {
        providers: { anthropic: { authType: 'apiKey', keys: ['k1'] } },
      };
      const json = JSON.parse(serializeSecrets(secret));
      expect(json.providers.anthropic.keys).toEqual(['k1']);
    });
  });

  describe('hasAnyCredentials', () => {
    it('returns true when API keys exist', () => {
      const secret: ProvidersSecret = { providers: { anthropic: { authType: 'apiKey', keys: ['k1'] } } };
      expect(hasAnyCredentials(secret)).toBe(true);
    });

    it('returns true when OAuth token exists', () => {
      const secret: ProvidersSecret = { providers: { 'anthropic-token': { authType: 'oauthToken', token: 'tok' } } };
      expect(hasAnyCredentials(secret)).toBe(true);
    });

    it('returns false when empty', () => {
      expect(hasAnyCredentials({ providers: {} })).toBe(false);
    });

    it('returns false when keys array is empty', () => {
      const secret: ProvidersSecret = { providers: { anthropic: { authType: 'apiKey', keys: [] } } };
      expect(hasAnyCredentials(secret)).toBe(false);
    });
  });
});
