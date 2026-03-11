import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { adminLambdaHandlerDecorator, HandlerMethod, HttpStatusCode, validateRequiredEnvVars } from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars(['CONFIG_TABLE_NAME']);

const dynamodb = new DynamoDBClient({});
const CONFIG_TABLE = process.env['CONFIG_TABLE_NAME']!;

export const handler = adminLambdaHandlerDecorator(HandlerMethod.GET, async (event) => {
  const teamId = event.pathParameters?.['teamId'];
  if (!teamId) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'teamId path parameter is required' },
    };
  }

  const result = await dynamodb.send(new QueryCommand({
    TableName: CONFIG_TABLE,
    KeyConditionExpression: 'scopeKey = :sk',
    ExpressionAttributeValues: {
      ':sk': { S: `team#${teamId}` },
    },
  }));

  const configs = (result.Items ?? []).map(item => ({
    configKey: item['configKey']?.S,
    value: item['value']?.S ? JSON.parse(item['value'].S) : null,
    updatedAt: item['updatedAt']?.S,
    updatedBy: item['updatedBy']?.S,
  }));

  return {
    status: HttpStatusCode.OK,
    body: { teamId, configs },
  };
});
