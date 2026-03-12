import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { adminLambdaHandlerDecorator, HandlerMethod, HttpStatusCode, validateRequiredEnvVars } from '@TeamClaw/teamclaw/cloud-function';
import type { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars({ CONFIG_TABLE_NAME: process.env['CONFIG_TABLE_NAME'] });

const dynamodb = new DynamoDBClient({});
const CONFIG_TABLE = process.env['CONFIG_TABLE_NAME']!;

const handlerFn = async (
  request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  const result = await dynamodb.send(new QueryCommand({
    TableName: CONFIG_TABLE,
    KeyConditionExpression: 'scopeKey = :sk',
    ExpressionAttributeValues: {
      ':sk': { S: 'global#default' },
    },
  }));

  const configs = (result.Items ?? []).map(item => ({
    configKey: item['configKey']?.S,
    value: item['value']?.S ? JSON.parse(item['value'].S) : null,
    updatedAt: item['updatedAt']?.S,
    updatedBy: item['updatedBy']?.S,
  }));

  return {
    status: HttpStatusCode.SUCCESS,
    body: { configs },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.GET,
  handlerFn,
);
