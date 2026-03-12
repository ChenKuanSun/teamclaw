import { DynamoDBClient, ScanCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import type { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars({
  TEAMS_TABLE_NAME: process.env['TEAMS_TABLE_NAME'],
  CONFIG_TABLE_NAME: process.env['CONFIG_TABLE_NAME'],
  API_KEYS_SECRET_ARN: process.env['API_KEYS_SECRET_ARN'],
});

const ddb = new DynamoDBClient({});
const sm = new SecretsManagerClient({});
const TEAMS_TABLE = process.env['TEAMS_TABLE_NAME']!;
const CONFIG_TABLE = process.env['CONFIG_TABLE_NAME']!;
const API_KEYS_SECRET_ARN = process.env['API_KEYS_SECRET_ARN']!;

const handlerFn = async (
  _request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  // Check API keys
  let hasApiKeys = false;
  try {
    const secret = await sm.send(new GetSecretValueCommand({ SecretId: API_KEYS_SECRET_ARN }));
    const keys = JSON.parse(secret.SecretString || '{}');
    hasApiKeys = Object.values(keys).some((arr: any) => Array.isArray(arr) && arr.length > 0);
  } catch {
    hasApiKeys = false;
  }

  // Check teams and global config
  let hasTeam = false;
  let hasAllowedDomains = false;
  let hasDefaultTeamId = false;
  try {
    const teamsResult = await ddb.send(new ScanCommand({
      TableName: TEAMS_TABLE,
      Select: 'COUNT',
      Limit: 1,
    }));
    hasTeam = (teamsResult.Count ?? 0) > 0;

    const configResult = await ddb.send(new QueryCommand({
      TableName: CONFIG_TABLE,
      KeyConditionExpression: 'scopeKey = :sk',
      ExpressionAttributeValues: { ':sk': { S: 'global#default' } },
    }));

    for (const item of configResult.Items ?? []) {
      const key = item['configKey']?.S;
      const value = item['value']?.S;
      if (key === 'allowedDomains' && value) {
        try {
          const domains = JSON.parse(value);
          hasAllowedDomains = Array.isArray(domains) && domains.length > 0;
        } catch { /* ignore */ }
      }
      if (key === 'defaultTeamId' && value) {
        try {
          const teamId = JSON.parse(value);
          hasDefaultTeamId = typeof teamId === 'string' && teamId.length > 0;
        } catch { /* ignore */ }
      }
    }
  } catch {
    // DynamoDB errors → treat all DDB-sourced steps as false
  }

  const steps = { apiKey: hasApiKeys, team: hasTeam, allowedDomains: hasAllowedDomains, defaultTeamId: hasDefaultTeamId };
  const complete = Object.values(steps).every(Boolean);

  return {
    status: HttpStatusCode.SUCCESS,
    body: { complete, steps },
  };
};

export const handler = adminLambdaHandlerDecorator(HandlerMethod.GET, handlerFn);
