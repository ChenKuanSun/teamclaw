import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import {
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  ResourceNotFoundException,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { getCatalogEntry, INTEGRATION_CATALOG } from './catalog-seed';

const ddb = new DynamoDBClient({});
const sm = new SecretsManagerClient({});
const TABLE = process.env['INTEGRATIONS_TABLE_NAME']!;
const DEPLOY_ENV = process.env['DEPLOY_ENV']!;

// ─── Input validation helpers ───
const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function validateId(id: string, fieldName: string): void {
  if (!id || !VALID_ID_PATTERN.test(id)) {
    throw new Error(
      `Invalid ${fieldName}: must be 1-64 alphanumeric/dash/underscore characters`,
    );
  }
}

export function validateCredentials(
  integrationId: string,
  credentials: Record<string, string>,
): void {
  const def = getCatalogEntry(integrationId);
  if (!def) throw new Error(`Unknown integration: ${integrationId}`);

  const schema = def.credentialSchema;
  const allowedKeys = new Set(schema.map(f => f.key));

  // Reject unknown keys
  for (const key of Object.keys(credentials)) {
    if (!/^[a-zA-Z0-9_]+$/.test(key)) {
      throw new Error(`Invalid credential key name: ${key}`);
    }
    if (!allowedKeys.has(key)) {
      throw new Error(`Unknown credential key: ${key}`);
    }
  }

  // Check required fields and value size
  for (const field of schema) {
    if (
      field.required &&
      (!credentials[field.key] || credentials[field.key].trim() === '')
    ) {
      throw new Error(`Missing required credential field: ${field.key}`);
    }
  }

  // Enforce max length on credential values
  for (const [key, value] of Object.entries(credentials)) {
    if (value.length > 4096) {
      throw new Error(
        `Credential value for '${key}' exceeds maximum length of 4096 characters`,
      );
    }
  }
}

// ─── Secret naming helpers ───
function globalSecretName(integrationId: string): string {
  validateId(integrationId, 'integrationId');
  return `tc/integrations/${DEPLOY_ENV}/global/${integrationId}`;
}

function teamSecretName(teamId: string, integrationId: string): string {
  validateId(teamId, 'teamId');
  validateId(integrationId, 'integrationId');
  return `tc/integrations/${DEPLOY_ENV}/team/${teamId}/${integrationId}`;
}

function userSecretName(userId: string, integrationId: string): string {
  validateId(userId, 'userId');
  validateId(integrationId, 'integrationId');
  return `tc/integrations/${DEPLOY_ENV}/user/${userId}/${integrationId}`;
}

// ─── DDB scope key helpers ───
function globalScopeKey(): string {
  return 'global';
}

function teamScopeKey(teamId: string): string {
  return `team#${teamId}`;
}

function userScopeKey(userId: string): string {
  return `user#${userId}`;
}

// ─── Secret CRUD helpers ───
async function upsertSecret(
  secretName: string,
  credentials: Record<string, string>,
): Promise<void> {
  const secretString = JSON.stringify(credentials);
  try {
    await sm.send(
      new CreateSecretCommand({
        Name: secretName,
        SecretString: secretString,
      }),
    );
  } catch (err: any) {
    if (err.name === 'ResourceExistsException') {
      await sm.send(
        new PutSecretValueCommand({
          SecretId: secretName,
          SecretString: secretString,
        }),
      );
    } else {
      throw err;
    }
  }
}

async function readSecret(
  secretName: string,
): Promise<Record<string, string> | null> {
  try {
    const result = await sm.send(
      new GetSecretValueCommand({ SecretId: secretName }),
    );
    return result.SecretString ? JSON.parse(result.SecretString) : null;
  } catch (err: any) {
    if (
      err instanceof ResourceNotFoundException ||
      err.name === 'ResourceNotFoundException'
    ) {
      return null;
    }
    throw err;
  }
}

async function removeSecret(secretName: string): Promise<void> {
  try {
    await sm.send(
      new DeleteSecretCommand({
        SecretId: secretName,
        ForceDeleteWithoutRecovery: true,
      }),
    );
  } catch (err: any) {
    if (
      err instanceof ResourceNotFoundException ||
      err.name === 'ResourceNotFoundException'
    ) {
      return; // Already deleted
    }
    throw err;
  }
}

// ─── Return type interfaces ───

export interface IntegrationListItem {
  integrationId: string;
  displayName: string;
  description: string;
  category: string;
  icon: string;
  credentialSchema: {
    key: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
  }[];
  envVarPrefix: string;
  enabled: boolean;
  hasCredentials: boolean;
  allowUserOverride: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface IntegrationDetailItem extends IntegrationListItem {
  teamOverrideCount: number;
}

export interface TeamOverrideItem {
  integrationId: string | undefined;
  teamId: string | undefined;
  enabled: boolean;
  hasCredentials: boolean;
  allowUserOverride: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface UserIntegrationItem {
  integrationId: string;
  displayName: string;
  description: string;
  category: string;
  icon: string;
  credentialSchema: {
    key: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
  }[];
  globalEnabled: boolean;
  allowUserOverride: boolean;
  hasGlobalCredentials: boolean;
  hasUserCredentials: boolean;
}

// ─── Public API ───

export async function listIntegrations(): Promise<IntegrationListItem[]> {
  // Get all global-scope DDB items
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'by-scope',
      KeyConditionExpression: 'scopeKey = :sk',
      ExpressionAttributeValues: { ':sk': { S: globalScopeKey() } },
    }),
  );

  const ddbMap = new Map<string, Record<string, any>>();
  for (const item of result.Items || []) {
    const id = item['integrationId']?.S;
    if (id) ddbMap.set(id, item);
  }

  return INTEGRATION_CATALOG.map(def => {
    const dbItem = ddbMap.get(def.integrationId);
    return {
      ...def,
      enabled: dbItem?.['enabled']?.BOOL ?? false,
      hasCredentials: dbItem?.['hasCredentials']?.BOOL ?? false,
      allowUserOverride: dbItem?.['allowUserOverride']?.BOOL ?? true,
      updatedAt: dbItem?.['updatedAt']?.S ?? null,
      updatedBy: dbItem?.['updatedBy']?.S ?? null,
    };
  });
}

export async function getIntegration(
  integrationId: string,
): Promise<IntegrationDetailItem | null> {
  const def = getCatalogEntry(integrationId);
  if (!def) return null;

  const result = await ddb.send(
    new GetItemCommand({
      TableName: TABLE,
      Key: {
        integrationId: { S: integrationId },
        scopeKey: { S: globalScopeKey() },
      },
    }),
  );

  const dbItem = result.Item;

  // Get team overrides count
  const teamOverrides = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression:
        'integrationId = :id AND begins_with(scopeKey, :prefix)',
      ExpressionAttributeValues: {
        ':id': { S: integrationId },
        ':prefix': { S: 'team#' },
      },
      Select: 'COUNT',
    }),
  );

  return {
    ...def,
    enabled: dbItem?.['enabled']?.BOOL ?? false,
    hasCredentials: dbItem?.['hasCredentials']?.BOOL ?? false,
    allowUserOverride: dbItem?.['allowUserOverride']?.BOOL ?? true,
    updatedAt: dbItem?.['updatedAt']?.S ?? null,
    updatedBy: dbItem?.['updatedBy']?.S ?? null,
    teamOverrideCount: teamOverrides.Count ?? 0,
  };
}

export async function setGlobalCredential(
  integrationId: string,
  credentials: Record<string, string>,
  adminUserId: string,
): Promise<void> {
  const def = getCatalogEntry(integrationId);
  if (!def) throw new Error(`Unknown integration: ${integrationId}`);

  validateCredentials(integrationId, credentials);
  await upsertSecret(globalSecretName(integrationId), credentials);

  // Use UpdateItemCommand to preserve existing fields like allowUserOverride
  await ddb.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: {
        integrationId: { S: integrationId },
        scopeKey: { S: globalScopeKey() },
      },
      UpdateExpression:
        'SET enabled = :enabled, hasCredentials = :hasCred, updatedAt = :now, updatedBy = :by' +
        ', allowUserOverride = if_not_exists(allowUserOverride, :defaultOverride)',
      ExpressionAttributeValues: {
        ':enabled': { BOOL: true },
        ':hasCred': { BOOL: true },
        ':now': { S: new Date().toISOString() },
        ':by': { S: adminUserId },
        ':defaultOverride': { BOOL: true },
      },
    }),
  );
}

export async function deleteGlobalCredential(
  integrationId: string,
): Promise<void> {
  // Delete secret FIRST to avoid orphaned secrets if DDB update fails
  await removeSecret(globalSecretName(integrationId));

  // Then update DDB — mark as disabled (atomic update, no read-then-write race)
  await ddb.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: {
        integrationId: { S: integrationId },
        scopeKey: { S: globalScopeKey() },
      },
      UpdateExpression:
        'SET enabled = :disabled, hasCredentials = :noCred, updatedAt = :now',
      ExpressionAttributeValues: {
        ':disabled': { BOOL: false },
        ':noCred': { BOOL: false },
        ':now': { S: new Date().toISOString() },
      },
    }),
  );
}

export async function setTeamOverride(
  integrationId: string,
  teamId: string,
  params: {
    enabled?: boolean;
    credentials?: Record<string, string>;
    allowUserOverride?: boolean;
  },
  adminUserId: string,
): Promise<void> {
  validateId(integrationId, 'integrationId');
  validateId(teamId, 'teamId');
  const def = getCatalogEntry(integrationId);
  if (!def) throw new Error(`Unknown integration: ${integrationId}`);

  if (params.credentials) {
    validateCredentials(integrationId, params.credentials);
    await upsertSecret(
      teamSecretName(teamId, integrationId),
      params.credentials,
    );
  }

  const now = new Date().toISOString();

  // Build update expression dynamically to only set provided fields
  const exprParts: string[] = ['updatedAt = :now', 'updatedBy = :by'];
  const exprValues: Record<string, any> = {
    ':now': { S: now },
    ':by': { S: adminUserId },
  };

  if (params.enabled !== undefined) {
    exprParts.push('enabled = :enabled');
    exprValues[':enabled'] = { BOOL: params.enabled };
  }
  if (params.credentials !== undefined) {
    exprParts.push('hasCredentials = :hasCred');
    exprValues[':hasCred'] = { BOOL: !!params.credentials };
  }
  if (params.allowUserOverride !== undefined) {
    exprParts.push('allowUserOverride = :allowOverride');
    exprValues[':allowOverride'] = { BOOL: params.allowUserOverride };
  }

  await ddb.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: {
        integrationId: { S: integrationId },
        scopeKey: { S: teamScopeKey(teamId) },
      },
      UpdateExpression: 'SET ' + exprParts.join(', '),
      ExpressionAttributeValues: exprValues,
    }),
  );
}

export async function deleteTeamCredential(
  integrationId: string,
  teamId: string,
): Promise<void> {
  validateId(integrationId, 'integrationId');
  validateId(teamId, 'teamId');
  // Delete secret FIRST to avoid orphaned secrets if DDB update fails
  await removeSecret(teamSecretName(teamId, integrationId));

  await ddb.send(
    new DeleteItemCommand({
      TableName: TABLE,
      Key: {
        integrationId: { S: integrationId },
        scopeKey: { S: teamScopeKey(teamId) },
      },
    }),
  );
}

export async function listTeamOverrides(
  integrationId: string,
): Promise<TeamOverrideItem[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression:
        'integrationId = :id AND begins_with(scopeKey, :prefix)',
      ExpressionAttributeValues: {
        ':id': { S: integrationId },
        ':prefix': { S: 'team#' },
      },
    }),
  );

  return (result.Items || []).map(item => ({
    integrationId: item['integrationId']?.S,
    teamId: item['scopeKey']?.S?.replace('team#', ''),
    enabled: item['enabled']?.BOOL ?? false,
    hasCredentials: item['hasCredentials']?.BOOL ?? false,
    allowUserOverride: item['allowUserOverride']?.BOOL ?? true,
    updatedAt: item['updatedAt']?.S ?? null,
    updatedBy: item['updatedBy']?.S ?? null,
  }));
}

// ─── User-facing ───

/**
 * Check whether user-level credential override is allowed for this integration,
 * considering global enabled status and team-level allowUserOverride setting.
 */
export async function checkUserOverrideAllowed(
  integrationId: string,
  teamId: string | undefined,
): Promise<{ allowed: boolean; reason?: string }> {
  const globalItem = await ddb.send(
    new GetItemCommand({
      TableName: TABLE,
      Key: {
        integrationId: { S: integrationId },
        scopeKey: { S: globalScopeKey() },
      },
    }),
  );

  if (!globalItem.Item || !globalItem.Item['enabled']?.BOOL) {
    return { allowed: false, reason: 'Integration is not globally enabled' };
  }

  if (globalItem.Item['allowUserOverride']?.BOOL === false) {
    return {
      allowed: false,
      reason: 'User override is not allowed for this integration',
    };
  }

  if (teamId) {
    const teamItem = await ddb.send(
      new GetItemCommand({
        TableName: TABLE,
        Key: {
          integrationId: { S: integrationId },
          scopeKey: { S: teamScopeKey(teamId) },
        },
      }),
    );
    if (teamItem.Item?.['allowUserOverride']?.BOOL === false) {
      return {
        allowed: false,
        reason: 'User override is not allowed by team policy',
      };
    }
  }

  return { allowed: true };
}

export async function setUserCredential(
  integrationId: string,
  userId: string,
  credentials: Record<string, string>,
): Promise<void> {
  const def = getCatalogEntry(integrationId);
  if (!def) throw new Error(`Unknown integration: ${integrationId}`);

  validateCredentials(integrationId, credentials);
  await upsertSecret(userSecretName(userId, integrationId), credentials);

  await ddb.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: {
        integrationId: { S: integrationId },
        scopeKey: { S: userScopeKey(userId) },
        enabled: { BOOL: true },
        hasCredentials: { BOOL: true },
        updatedAt: { S: new Date().toISOString() },
      },
    }),
  );
}

export async function deleteUserCredential(
  integrationId: string,
  userId: string,
): Promise<void> {
  // Delete secret FIRST to avoid orphaned secrets if DDB delete fails
  await removeSecret(userSecretName(userId, integrationId));

  await ddb.send(
    new DeleteItemCommand({
      TableName: TABLE,
      Key: {
        integrationId: { S: integrationId },
        scopeKey: { S: userScopeKey(userId) },
      },
    }),
  );
}

/**
 * Resolve effective credential for a single integration.
 * Cascade: user > team > global
 */
export async function resolveEffectiveCredential(
  userId: string,
  teamId: string | undefined,
  integrationId: string,
): Promise<Record<string, string> | null> {
  // Check allowUserOverride from team-level and global-level DDB items
  let allowUserOverride = true;

  if (teamId) {
    const teamItem = await ddb.send(
      new GetItemCommand({
        TableName: TABLE,
        Key: {
          integrationId: { S: integrationId },
          scopeKey: { S: teamScopeKey(teamId) },
        },
        ProjectionExpression: 'allowUserOverride',
      }),
    );
    if (teamItem.Item?.['allowUserOverride']?.BOOL === false) {
      allowUserOverride = false;
    }
  }

  if (allowUserOverride) {
    const globalItem = await ddb.send(
      new GetItemCommand({
        TableName: TABLE,
        Key: {
          integrationId: { S: integrationId },
          scopeKey: { S: globalScopeKey() },
        },
        ProjectionExpression: 'allowUserOverride',
      }),
    );
    if (globalItem.Item?.['allowUserOverride']?.BOOL === false) {
      allowUserOverride = false;
    }
  }

  // 1. Try user-level (only if overrides allowed)
  if (allowUserOverride) {
    const userCreds = await readSecret(userSecretName(userId, integrationId));
    if (userCreds) return userCreds;
  }

  // 2. Try team-level
  if (teamId) {
    const teamCreds = await readSecret(teamSecretName(teamId, integrationId));
    if (teamCreds) return teamCreds;
  }

  // 3. Try global
  return readSecret(globalSecretName(integrationId));
}

/**
 * Resolve all enabled integration credentials for a user.
 * Returns a map of integrationId -> credential fields.
 */
export async function resolveAllCredentials(
  userId: string,
  teamId: string | undefined,
): Promise<Record<string, Record<string, string>>> {
  // Get all globally enabled integrations
  const globalItems = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'by-scope',
      KeyConditionExpression: 'scopeKey = :sk',
      ExpressionAttributeValues: { ':sk': { S: globalScopeKey() } },
    }),
  );

  const result: Record<string, Record<string, string>> = {};

  for (const item of globalItems.Items || []) {
    const id = item['integrationId']?.S;
    const enabled = item['enabled']?.BOOL;
    if (!id || !enabled) continue;

    const creds = await resolveEffectiveCredential(userId, teamId, id);
    if (creds) {
      result[id] = creds;
    }
  }

  return result;
}

/**
 * List integrations with resolved status for a specific user.
 * Used by user-facing endpoints.
 */
export async function listUserIntegrations(
  userId: string,
  teamId: string | undefined,
): Promise<UserIntegrationItem[]> {
  // Get all global items
  const globalItems = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'by-scope',
      KeyConditionExpression: 'scopeKey = :sk',
      ExpressionAttributeValues: { ':sk': { S: globalScopeKey() } },
    }),
  );

  const globalMap = new Map<string, Record<string, any>>();
  for (const item of globalItems.Items || []) {
    const id = item['integrationId']?.S;
    if (id) globalMap.set(id, item);
  }

  // Get user items
  const userItems = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'by-scope',
      KeyConditionExpression: 'scopeKey = :sk',
      ExpressionAttributeValues: { ':sk': { S: userScopeKey(userId) } },
    }),
  );

  const userMap = new Map<string, Record<string, any>>();
  for (const item of userItems.Items || []) {
    const id = item['integrationId']?.S;
    if (id) userMap.set(id, item);
  }

  return INTEGRATION_CATALOG.map(def => {
    const globalItem = globalMap.get(def.integrationId);
    const userItem = userMap.get(def.integrationId);
    const globalEnabled = globalItem?.['enabled']?.BOOL ?? false;
    const allowUserOverride = globalItem?.['allowUserOverride']?.BOOL ?? true;

    return {
      integrationId: def.integrationId,
      displayName: def.displayName,
      description: def.description,
      category: def.category,
      icon: def.icon,
      credentialSchema: def.credentialSchema,
      globalEnabled,
      allowUserOverride,
      hasGlobalCredentials: globalItem?.['hasCredentials']?.BOOL ?? false,
      hasUserCredentials: userItem?.['hasCredentials']?.BOOL ?? false,
    };
  });
}
