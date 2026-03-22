const mockDdbSend = jest.fn();
const mockSmSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockDdbSend })),
  GetItemCommand: jest.fn((input: any) => ({ input, _type: 'GetItem' })),
  PutItemCommand: jest.fn((input: any) => ({ input, _type: 'PutItem' })),
  UpdateItemCommand: jest.fn((input: any) => ({ input, _type: 'UpdateItem' })),
  QueryCommand: jest.fn((input: any) => ({ input, _type: 'Query' })),
  DeleteItemCommand: jest.fn((input: any) => ({ input, _type: 'DeleteItem' })),
}));

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => ({ send: mockSmSend })),
  CreateSecretCommand: jest.fn((input: any) => ({
    input,
    _type: 'CreateSecret',
  })),
  PutSecretValueCommand: jest.fn((input: any) => ({
    input,
    _type: 'PutSecretValue',
  })),
  GetSecretValueCommand: jest.fn((input: any) => ({
    input,
    _type: 'GetSecretValue',
  })),
  DeleteSecretCommand: jest.fn((input: any) => ({
    input,
    _type: 'DeleteSecret',
  })),
  ResourceNotFoundException: class ResourceNotFoundException extends Error {
    override name = 'ResourceNotFoundException';
  },
}));

process.env['INTEGRATIONS_TABLE_NAME'] = 'IntegrationsTable';
process.env['DEPLOY_ENV'] = 'prod';

import {
  deleteGlobalCredential,
  deleteTeamCredential,
  deleteUserCredential,
  getIntegration,
  listIntegrations,
  listTeamOverrides,
  listUserIntegrations,
  resolveAllCredentials,
  resolveEffectiveCredential,
  setGlobalCredential,
  setTeamOverride,
  setUserCredential,
  validateCredentials,
} from './integrations-core';

describe('integrations-core', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateCredentials', () => {
    it('should accept valid credentials matching schema', () => {
      expect(() =>
        validateCredentials('github', { token: 'ghp_test123' }),
      ).not.toThrow();
    });

    it('should reject unknown integration', () => {
      expect(() => validateCredentials('unknown', { token: 'abc' })).toThrow(
        'Unknown integration: unknown',
      );
    });

    it('should reject unknown credential keys', () => {
      expect(() =>
        validateCredentials('github', { token: 'ghp_test', extraKey: 'bad' }),
      ).toThrow('Unknown credential key: extraKey');
    });

    it('should reject missing required fields', () => {
      expect(() => validateCredentials('github', {})).toThrow(
        'Missing required credential field: token',
      );
    });

    it('should reject empty required fields', () => {
      expect(() => validateCredentials('github', { token: '  ' })).toThrow(
        'Missing required credential field: token',
      );
    });

    it('should reject invalid key names', () => {
      expect(() =>
        validateCredentials('github', { 'bad/../key': 'value' }),
      ).toThrow('Invalid credential key name: bad/../key');
    });

    it('should reject credential values exceeding max length', () => {
      const longValue = 'a'.repeat(4097);
      expect(() => validateCredentials('github', { token: longValue })).toThrow(
        'exceeds maximum length of 4096',
      );
    });

    it('should accept credential values at max length', () => {
      const maxValue = 'a'.repeat(4096);
      expect(() =>
        validateCredentials('github', { token: maxValue }),
      ).not.toThrow();
    });

    it('should validate multi-field schemas (jira)', () => {
      expect(() =>
        validateCredentials('jira', {
          email: 'user@test.com',
          token: 'tok',
          baseUrl: 'https://org.atlassian.net',
        }),
      ).not.toThrow();
    });

    it('should reject jira with missing required field', () => {
      expect(() =>
        validateCredentials('jira', {
          email: 'user@test.com',
          token: 'tok',
        }),
      ).toThrow('Missing required credential field: baseUrl');
    });
  });

  describe('input validation', () => {
    it('should reject path-injection teamId in setTeamOverride', async () => {
      await expect(
        setTeamOverride(
          'github',
          '../../../etc/passwd',
          { enabled: true },
          'admin-1',
        ),
      ).rejects.toThrow('Invalid teamId');
    });

    it('should reject empty integrationId in setGlobalCredential', async () => {
      await expect(
        setGlobalCredential('', { token: 'test' }, 'admin-1'),
      ).rejects.toThrow('Unknown integration: ');
    });

    it('should reject overly long IDs', async () => {
      const longId = 'a'.repeat(65);
      await expect(
        setGlobalCredential(longId, { token: 'test' }, 'admin-1'),
      ).rejects.toThrow('Unknown integration');
    });
  });

  describe('listIntegrations', () => {
    it('should return catalog merged with DDB state', async () => {
      mockDdbSend.mockResolvedValueOnce({
        Items: [
          {
            integrationId: { S: 'github' },
            scopeKey: { S: 'global' },
            enabled: { BOOL: true },
            hasCredentials: { BOOL: true },
            allowUserOverride: { BOOL: true },
            updatedAt: { S: '2026-03-01T00:00:00.000Z' },
            updatedBy: { S: 'admin-1' },
          },
        ],
      });

      const result = await listIntegrations();

      expect(result).toHaveLength(6); // All catalog items
      const github = result.find((r: any) => r.integrationId === 'github')!;
      expect(github.enabled).toBe(true);
      expect(github.hasCredentials).toBe(true);
      expect(github.displayName).toBe('GitHub');

      const slack = result.find((r: any) => r.integrationId === 'slack')!;
      expect(slack.enabled).toBe(false);
      expect(slack.hasCredentials).toBe(false);
    });

    it('should return all defaults when DDB is empty', async () => {
      mockDdbSend.mockResolvedValueOnce({ Items: [] });

      const result = await listIntegrations();
      expect(result).toHaveLength(6);
      for (const item of result) {
        expect(item.enabled).toBe(false);
        expect(item.hasCredentials).toBe(false);
      }
    });
  });

  describe('getIntegration', () => {
    it('should return null for unknown integration', async () => {
      const result = await getIntegration('unknown');
      expect(result).toBeNull();
    });

    it('should return integration with team override count', async () => {
      // GetItem for global scope
      mockDdbSend.mockResolvedValueOnce({
        Item: {
          integrationId: { S: 'notion' },
          scopeKey: { S: 'global' },
          enabled: { BOOL: true },
          hasCredentials: { BOOL: true },
        },
      });
      // Query for team overrides count
      mockDdbSend.mockResolvedValueOnce({ Count: 3 });

      const result = await getIntegration('notion');
      expect(result!.integrationId).toBe('notion');
      expect(result!.enabled).toBe(true);
      expect(result!.teamOverrideCount).toBe(3);
    });
  });

  describe('setGlobalCredential', () => {
    it('should create secret and update DDB', async () => {
      mockSmSend.mockResolvedValueOnce({}); // CreateSecret
      mockDdbSend.mockResolvedValueOnce({}); // UpdateItem

      await setGlobalCredential('github', { token: 'ghp_test123' }, 'admin-1');

      // Verify secret creation
      const smCall = mockSmSend.mock.calls[0][0];
      expect(smCall.input.Name).toBe('tc/integrations/prod/global/github');
      expect(JSON.parse(smCall.input.SecretString)).toEqual({
        token: 'ghp_test123',
      });

      // Verify DDB update uses UpdateItemCommand (preserves allowUserOverride)
      const ddbCall = mockDdbSend.mock.calls[0][0];
      expect(ddbCall._type).toBe('UpdateItem');
      expect(ddbCall.input.Key.integrationId.S).toBe('github');
      expect(ddbCall.input.ExpressionAttributeValues[':enabled'].BOOL).toBe(
        true,
      );
      expect(ddbCall.input.ExpressionAttributeValues[':hasCred'].BOOL).toBe(
        true,
      );
    });

    it('should update existing secret via PutSecretValue on ResourceExistsException', async () => {
      const err = new Error('already exists');
      (err as any).name = 'ResourceExistsException';
      mockSmSend.mockRejectedValueOnce(err); // CreateSecret fails
      mockSmSend.mockResolvedValueOnce({}); // PutSecretValue succeeds
      mockDdbSend.mockResolvedValueOnce({}); // UpdateItem

      await setGlobalCredential('github', { token: 'ghp_updated' }, 'admin-1');

      expect(mockSmSend).toHaveBeenCalledTimes(2);
    });

    it('should throw for unknown integration', async () => {
      await expect(
        setGlobalCredential('unknown', { token: 'abc' }, 'admin-1'),
      ).rejects.toThrow('Unknown integration: unknown');
    });

    it('should reject invalid credentials', async () => {
      await expect(
        setGlobalCredential('github', { badKey: 'abc' }, 'admin-1'),
      ).rejects.toThrow('Unknown credential key: badKey');
    });
  });

  describe('deleteGlobalCredential', () => {
    it('should delete secret first, then update DDB', async () => {
      mockSmSend.mockResolvedValueOnce({}); // DeleteSecret (first)
      mockDdbSend.mockResolvedValueOnce({}); // UpdateItem

      await deleteGlobalCredential('github');

      // Secret deleted first
      expect(mockSmSend).toHaveBeenCalledTimes(1);
      const smCall = mockSmSend.mock.calls[0][0];
      expect(smCall._type).toBe('DeleteSecret');

      // Then DDB: UpdateItem with enabled=false, hasCredentials=false
      expect(mockDdbSend).toHaveBeenCalledTimes(1);
      const updateCall = mockDdbSend.mock.calls[0][0];
      expect(updateCall._type).toBe('UpdateItem');
      expect(updateCall.input.ExpressionAttributeValues[':disabled'].BOOL).toBe(
        false,
      );
      expect(updateCall.input.ExpressionAttributeValues[':noCred'].BOOL).toBe(
        false,
      );
    });
  });

  describe('setTeamOverride', () => {
    it('should create team secret and DDB entry', async () => {
      mockSmSend.mockResolvedValueOnce({}); // CreateSecret
      mockDdbSend.mockResolvedValueOnce({}); // UpdateItem

      await setTeamOverride(
        'slack',
        'team-1',
        {
          enabled: true,
          credentials: { botToken: 'xoxb-test' },
          allowUserOverride: false,
        },
        'admin-1',
      );

      const smCall = mockSmSend.mock.calls[0][0];
      expect(smCall.input.Name).toBe('tc/integrations/prod/team/team-1/slack');

      const ddbCall = mockDdbSend.mock.calls[0][0];
      expect(ddbCall._type).toBe('UpdateItem');
      expect(ddbCall.input.Key.integrationId.S).toBe('slack');
      expect(ddbCall.input.Key.scopeKey.S).toBe('team#team-1');
      expect(
        ddbCall.input.ExpressionAttributeValues[':allowOverride'].BOOL,
      ).toBe(false);
    });
  });

  describe('deleteTeamCredential', () => {
    it('should delete secret first, then DDB entry', async () => {
      mockSmSend.mockResolvedValueOnce({}); // DeleteSecret (first)
      mockDdbSend.mockResolvedValueOnce({}); // DeleteItem

      await deleteTeamCredential('slack', 'team-1');

      // Secret deleted first
      const smCall = mockSmSend.mock.calls[0][0];
      expect(smCall._type).toBe('DeleteSecret');

      // Then DDB
      const ddbCall = mockDdbSend.mock.calls[0][0];
      expect(ddbCall.input.Key.integrationId.S).toBe('slack');
      expect(ddbCall.input.Key.scopeKey.S).toBe('team#team-1');
    });
  });

  describe('listTeamOverrides', () => {
    it('should return team overrides for an integration', async () => {
      mockDdbSend.mockResolvedValueOnce({
        Items: [
          {
            integrationId: { S: 'slack' },
            scopeKey: { S: 'team#team-1' },
            enabled: { BOOL: true },
            hasCredentials: { BOOL: true },
            allowUserOverride: { BOOL: true },
            updatedAt: { S: '2026-03-01T00:00:00.000Z' },
            updatedBy: { S: 'admin-1' },
          },
          {
            integrationId: { S: 'slack' },
            scopeKey: { S: 'team#team-2' },
            enabled: { BOOL: false },
            hasCredentials: { BOOL: false },
          },
        ],
      });

      const result = await listTeamOverrides('slack');
      expect(result).toHaveLength(2);
      expect(result[0].teamId).toBe('team-1');
      expect(result[0].enabled).toBe(true);
      expect(result[1].teamId).toBe('team-2');
      expect(result[1].enabled).toBe(false);
    });
  });

  describe('setUserCredential', () => {
    it('should create user secret and DDB entry', async () => {
      mockSmSend.mockResolvedValueOnce({}); // CreateSecret
      mockDdbSend.mockResolvedValueOnce({}); // PutItem

      await setUserCredential('github', 'user-1', { token: 'ghp_personal' });

      const smCall = mockSmSend.mock.calls[0][0];
      expect(smCall.input.Name).toBe('tc/integrations/prod/user/user-1/github');

      const ddbCall = mockDdbSend.mock.calls[0][0];
      expect(ddbCall.input.Item.scopeKey.S).toBe('user#user-1');
    });

    it('should reject invalid credentials', async () => {
      await expect(
        setUserCredential('github', 'user-1', { badKey: 'value' }),
      ).rejects.toThrow('Unknown credential key: badKey');
    });
  });

  describe('deleteUserCredential', () => {
    it('should delete secret first, then DDB entry', async () => {
      mockSmSend.mockResolvedValueOnce({}); // DeleteSecret (first)
      mockDdbSend.mockResolvedValueOnce({}); // DeleteItem

      await deleteUserCredential('github', 'user-1');

      // Secret deleted first
      const smCall = mockSmSend.mock.calls[0][0];
      expect(smCall._type).toBe('DeleteSecret');

      // Then DDB
      const ddbCall = mockDdbSend.mock.calls[0][0];
      expect(ddbCall._type).toBe('DeleteItem');
      expect(ddbCall.input.Key.integrationId.S).toBe('github');
      expect(ddbCall.input.Key.scopeKey.S).toBe('user#user-1');
    });
  });

  describe('resolveEffectiveCredential', () => {
    it('should return user creds when allowUserOverride is true (cascade priority)', async () => {
      // DDB GetItem for team-level allowUserOverride check
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });
      // DDB GetItem for global-level allowUserOverride check
      mockDdbSend.mockResolvedValueOnce({
        Item: { allowUserOverride: { BOOL: true } },
      });
      // SM: user secret found
      mockSmSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({ token: 'user-token' }),
      });

      const result = await resolveEffectiveCredential(
        'user-1',
        'team-1',
        'github',
      );
      expect(result).toEqual({ token: 'user-token' });
    });

    it('should skip user creds when global allowUserOverride is false', async () => {
      // DDB GetItem for team-level (no team override item)
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });
      // DDB GetItem for global-level allowUserOverride = false
      mockDdbSend.mockResolvedValueOnce({
        Item: { allowUserOverride: { BOOL: false } },
      });
      // SM: team secret (skips user, goes to team)
      mockSmSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({ token: 'team-token' }),
      });

      const result = await resolveEffectiveCredential(
        'user-1',
        'team-1',
        'github',
      );
      expect(result).toEqual({ token: 'team-token' });
      // User secret should NOT have been queried
    });

    it('should skip user creds when team allowUserOverride is false', async () => {
      // DDB GetItem for team-level allowUserOverride = false
      mockDdbSend.mockResolvedValueOnce({
        Item: { allowUserOverride: { BOOL: false } },
      });
      // SM: team secret
      mockSmSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({ token: 'team-token' }),
      });

      const result = await resolveEffectiveCredential(
        'user-1',
        'team-1',
        'github',
      );
      expect(result).toEqual({ token: 'team-token' });
      // Global allowUserOverride check should be skipped (already false from team)
      expect(mockDdbSend).toHaveBeenCalledTimes(1);
    });

    it('should fall back to team creds when user has none', async () => {
      // DDB: team allowUserOverride check
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });
      // DDB: global allowUserOverride check
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });
      // User secret not found
      const notFound = new Error('not found');
      (notFound as any).name = 'ResourceNotFoundException';
      mockSmSend.mockRejectedValueOnce(notFound);
      // Team secret found
      mockSmSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({ botToken: 'team-token' }),
      });

      const result = await resolveEffectiveCredential(
        'user-1',
        'team-1',
        'slack',
      );
      expect(result).toEqual({ botToken: 'team-token' });
    });

    it('should fall back to global when user and team have none', async () => {
      // DDB: team allowUserOverride check
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });
      // DDB: global allowUserOverride check
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });
      const notFound = new Error('not found');
      (notFound as any).name = 'ResourceNotFoundException';
      mockSmSend.mockRejectedValueOnce(notFound); // user
      mockSmSend.mockRejectedValueOnce(notFound); // team
      mockSmSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({ token: 'global-token' }),
      });

      const result = await resolveEffectiveCredential(
        'user-1',
        'team-1',
        'github',
      );
      expect(result).toEqual({ token: 'global-token' });
    });

    it('should return null when no creds at any level', async () => {
      // DDB: team allowUserOverride check
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });
      // DDB: global allowUserOverride check
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });
      const notFound = new Error('not found');
      (notFound as any).name = 'ResourceNotFoundException';
      mockSmSend.mockRejectedValueOnce(notFound);
      mockSmSend.mockRejectedValueOnce(notFound);
      mockSmSend.mockRejectedValueOnce(notFound);

      const result = await resolveEffectiveCredential(
        'user-1',
        'team-1',
        'github',
      );
      expect(result).toBeNull();
    });

    it('should skip team DDB check when no teamId', async () => {
      // DDB: global allowUserOverride check (no team check since teamId is undefined)
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });
      // SM: user secret
      mockSmSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({ token: 'user-token' }),
      });

      const result = await resolveEffectiveCredential(
        'user-1',
        undefined,
        'github',
      );
      expect(result).toEqual({ token: 'user-token' });
      expect(mockDdbSend).toHaveBeenCalledTimes(1); // Only global check
    });
  });

  describe('resolveAllCredentials', () => {
    it('should resolve credentials for all enabled integrations', async () => {
      // Query global-scope items
      mockDdbSend.mockResolvedValueOnce({
        Items: [
          { integrationId: { S: 'github' }, enabled: { BOOL: true } },
          { integrationId: { S: 'slack' }, enabled: { BOOL: false } },
        ],
      });

      // resolveEffectiveCredential for github:
      // DDB: team allowUserOverride check
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });
      // DDB: global allowUserOverride check
      mockDdbSend.mockResolvedValueOnce({ Item: undefined });
      // SM: user-level secret for github
      mockSmSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({ token: 'ghp_user' }),
      });

      const result = await resolveAllCredentials('user-1', 'team-1');
      expect(result).toEqual({ github: { token: 'ghp_user' } });
      expect(result['slack']).toBeUndefined(); // disabled
    });
  });

  describe('listUserIntegrations', () => {
    it('should return catalog with user-specific status', async () => {
      // Query global-scope items
      mockDdbSend.mockResolvedValueOnce({
        Items: [
          {
            integrationId: { S: 'github' },
            enabled: { BOOL: true },
            hasCredentials: { BOOL: true },
            allowUserOverride: { BOOL: true },
          },
        ],
      });

      // Query user-scope items
      mockDdbSend.mockResolvedValueOnce({
        Items: [
          {
            integrationId: { S: 'github' },
            hasCredentials: { BOOL: true },
          },
        ],
      });

      const result = await listUserIntegrations('user-1', 'team-1');
      expect(result).toHaveLength(6);

      const github = result.find((r: any) => r.integrationId === 'github')!;
      expect(github.globalEnabled).toBe(true);
      expect(github.hasGlobalCredentials).toBe(true);
      expect(github.hasUserCredentials).toBe(true);
      expect(github.allowUserOverride).toBe(true);

      const slack = result.find((r: any) => r.integrationId === 'slack')!;
      expect(slack.globalEnabled).toBe(false);
      expect(slack.hasUserCredentials).toBe(false);
    });
  });
});
