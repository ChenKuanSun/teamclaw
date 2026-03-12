import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';
import type { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars({ USAGE_TABLE_NAME: process.env['USAGE_TABLE_NAME'] });

const dynamodb = new DynamoDBClient({});
const USAGE_TABLE = process.env['USAGE_TABLE_NAME']!;

const handlerFn = async (
  request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  const { queryStringParameters } = request;
  const from = queryStringParameters?.['from'];
  const to = queryStringParameters?.['to'] || new Date().toISOString();

  if (!from) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'from query parameter is required (ISO 8601 date)' },
    };
  }

  let totalRequests = 0;
  const uniqueUsers = new Set<string>();
  const byProvider: Record<string, number> = {};
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const result = await dynamodb.send(new ScanCommand({
      TableName: USAGE_TABLE,
      FilterExpression: '#ts BETWEEN :from AND :to',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: {
        ':from': { S: from },
        ':to': { S: to },
      },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const item of result.Items ?? []) {
      totalRequests++;
      const userId = item['userId']?.S;
      if (userId) uniqueUsers.add(userId);
      const provider = item['provider']?.S || 'unknown';
      byProvider[provider] = (byProvider[provider] || 0) + 1;
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return {
    status: HttpStatusCode.SUCCESS,
    body: {
      dateRange: { from, to },
      totalRequests,
      uniqueUsers: uniqueUsers.size,
      byProvider,
    },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.GET,
  handlerFn,
);
