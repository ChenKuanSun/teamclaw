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
  const limit = parseInt(queryStringParameters?.['limit'] || '50', 10);
  const nextToken = queryStringParameters?.['nextToken'];

  // Build filter expression
  let filterExpression: string | undefined;
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  if (from) {
    filterExpression = '#ts BETWEEN :from AND :to';
    expressionAttributeNames['#ts'] = 'timestamp';
    expressionAttributeValues[':from'] = { S: from };
    expressionAttributeValues[':to'] = { S: to };
  }

  // Decode in-memory pagination offset from nextToken
  let offset = 0;
  if (nextToken) {
    try {
      const decoded = JSON.parse(Buffer.from(nextToken, 'base64').toString());
      offset = decoded.offset || 0;
    } catch {
      return {
        status: HttpStatusCode.BAD_REQUEST,
        body: { message: 'Invalid nextToken' },
      };
    }
  }

  // Collect all matching items (full paginated scan)
  const userUsage: Record<string, { requestCount: number; providers: Record<string, number> }> = {};
  let currentStartKey: Record<string, any> | undefined;

  do {
    const result = await dynamodb.send(new ScanCommand({
      TableName: USAGE_TABLE,
      FilterExpression: filterExpression,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
      ExclusiveStartKey: currentStartKey,
    }));

    for (const item of result.Items ?? []) {
      const userId = item['userId']?.S || 'unknown';
      const provider = item['provider']?.S || 'unknown';

      if (!userUsage[userId]) {
        userUsage[userId] = { requestCount: 0, providers: {} };
      }
      userUsage[userId].requestCount++;
      userUsage[userId].providers[provider] = (userUsage[userId].providers[provider] || 0) + 1;
    }

    currentStartKey = result.LastEvaluatedKey;
  } while (currentStartKey);

  // Sort users by request count descending and paginate the result
  const sortedUsers = Object.entries(userUsage)
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.requestCount - a.requestCount);

  const page = sortedUsers.slice(offset, offset + limit);
  const hasMore = offset + limit < sortedUsers.length;

  return {
    status: HttpStatusCode.SUCCESS,
    body: {
      users: page,
      totalUsers: sortedUsers.length,
      nextToken: hasMore
        ? Buffer.from(JSON.stringify({ offset: offset + limit })).toString('base64')
        : undefined,
    },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.GET,
  handlerFn,
);
