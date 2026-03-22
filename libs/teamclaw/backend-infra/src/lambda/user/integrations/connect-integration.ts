import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import type { POSTAndPUTCloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import { getCatalogEntry } from '../../admin/integrations/catalog-seed';
import {
  checkUserOverrideAllowed,
  setUserCredential,
} from '../../admin/integrations/integrations-core';

validateRequiredEnvVars({
  INTEGRATIONS_TABLE_NAME: process.env['INTEGRATIONS_TABLE_NAME'],
  DEPLOY_ENV: process.env['DEPLOY_ENV'],
  USERS_TABLE_NAME: process.env['USERS_TABLE_NAME'],
});

const ddb = new DynamoDBClient({});
const USERS_TABLE = process.env['USERS_TABLE_NAME']!;

const handlerFn = async (
  request: POSTAndPUTCloudFunctionInput<Record<string, unknown>>,
): Promise<{ status: number; body: unknown }> => {
  const sub =
    (request.raw?.requestContext?.authorizer?.jwt?.claims?.['sub'] as string) ||
    '';
  const integrationId = request.pathParameters?.['integrationId'];

  if (!sub) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'Missing sub in JWT' },
    };
  }

  if (!integrationId) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'integrationId path parameter is required' },
    };
  }

  if (!getCatalogEntry(integrationId)) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: `Unknown integration: ${integrationId}` },
    };
  }

  const credentials = request.body?.['credentials'] as
    | Record<string, string>
    | undefined;

  if (!credentials || typeof credentials !== 'object') {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'credentials object is required in body' },
    };
  }

  // Get the user's teamId from the users table
  const userRecord = await ddb.send(
    new GetItemCommand({
      TableName: USERS_TABLE,
      Key: { userId: { S: sub } },
    }),
  );
  const teamId = userRecord.Item?.['teamId']?.S || undefined;

  // Check if user override is allowed (global enabled + team policy)
  const overrideCheck = await checkUserOverrideAllowed(integrationId, teamId);
  if (!overrideCheck.allowed) {
    return {
      status: HttpStatusCode.FORBIDDEN,
      body: { message: overrideCheck.reason },
    };
  }

  await setUserCredential(integrationId, sub, credentials);

  return {
    status: HttpStatusCode.SUCCESS,
    body: { message: 'Integration connected', integrationId },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.POST,
  handlerFn,
);
