import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { adminLambdaHandlerDecorator, HandlerMethod, HttpStatusCode, validateRequiredEnvVars } from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars(['CONFIG_TABLE_NAME']);

const dynamodb = new DynamoDBClient({});
const CONFIG_TABLE = process.env['CONFIG_TABLE_NAME']!;

export const handler = adminLambdaHandlerDecorator(HandlerMethod.PUT, async (event) => {
  const teamId = event.pathParameters?.['teamId'];
  if (!teamId) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'teamId path parameter is required' },
    };
  }

  const body = JSON.parse(event.body || '{}');
  const { configKey, value } = body;

  if (!configKey || value === undefined) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'configKey and value are required' },
    };
  }

  const updatedBy = event.requestContext?.authorizer?.['claims']?.sub || 'admin';

  await dynamodb.send(new PutItemCommand({
    TableName: CONFIG_TABLE,
    Item: {
      scopeKey: { S: `team#${teamId}` },
      configKey: { S: configKey },
      value: { S: JSON.stringify(value) },
      updatedAt: { S: new Date().toISOString() },
      updatedBy: { S: updatedBy },
    },
  }));

  return {
    status: HttpStatusCode.OK,
    body: { message: 'Team config updated', teamId, configKey },
  };
});
