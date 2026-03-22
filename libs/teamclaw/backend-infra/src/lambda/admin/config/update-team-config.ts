import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { adminLambdaHandlerDecorator, HandlerMethod, HttpStatusCode, validateRequiredEnvVars } from '@TeamClaw/teamclaw/cloud-function';
import type { POSTAndPUTCloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars({ CONFIG_TABLE_NAME: process.env['CONFIG_TABLE_NAME'] });

const dynamodb = new DynamoDBClient({});
const CONFIG_TABLE = process.env['CONFIG_TABLE_NAME']!;

const handlerFn = async (
  request: POSTAndPUTCloudFunctionInput<Record<string, unknown>>,
): Promise<{ status: number; body: unknown }> => {
  const { body, pathParameters } = request;
  const teamId = pathParameters?.['teamId'];
  if (!teamId) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'teamId path parameter is required' },
    };
  }

  const { configKey, value } = body;

  if (!configKey || value === undefined) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'configKey and value are required' },
    };
  }

  const updatedBy = (request.raw?.requestContext?.authorizer?.jwt?.claims?.['sub'] as string) || 'admin';

  await dynamodb.send(new PutItemCommand({
    TableName: CONFIG_TABLE,
    Item: {
      scopeKey: { S: `team#${teamId}` },
      configKey: { S: configKey as string },
      value: { S: JSON.stringify(value) },
      updatedAt: { S: new Date().toISOString() },
      updatedBy: { S: updatedBy },
    },
  }));

  return {
    status: HttpStatusCode.SUCCESS,
    body: { message: 'Team config updated', teamId, configKey },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.PUT,
  handlerFn,
);
