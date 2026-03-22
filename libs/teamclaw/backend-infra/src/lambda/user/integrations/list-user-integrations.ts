import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import type { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import { listUserIntegrations } from '../../admin/integrations/integrations-core';

validateRequiredEnvVars({
  INTEGRATIONS_TABLE_NAME: process.env['INTEGRATIONS_TABLE_NAME'],
  DEPLOY_ENV: process.env['DEPLOY_ENV'],
  USERS_TABLE_NAME: process.env['USERS_TABLE_NAME'],
});

const ddb = new DynamoDBClient({});
const USERS_TABLE = process.env['USERS_TABLE_NAME']!;

const handlerFn = async (
  request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  const sub =
    (request.raw?.requestContext?.authorizer?.jwt?.claims?.['sub'] as string) ||
    '';

  if (!sub) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'Missing sub in JWT' },
    };
  }

  const userRecord = await ddb.send(
    new GetItemCommand({
      TableName: USERS_TABLE,
      Key: { userId: { S: sub } },
    }),
  );

  const teamId = userRecord.Item?.['teamId']?.S || undefined;
  const integrations = await listUserIntegrations(sub, teamId);

  return {
    status: HttpStatusCode.SUCCESS,
    body: { integrations },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.GET,
  handlerFn,
);
