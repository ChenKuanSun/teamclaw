import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';

const dynamodb = new DynamoDBClient({});
const USAGE_TABLE = process.env['USAGE_TABLE_NAME']!;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const from = event.queryStringParameters?.['from'];
    const to = event.queryStringParameters?.['to'] || new Date().toISOString();
    const limit = parseInt(event.queryStringParameters?.['limit'] || '50', 10);
    const nextToken = event.queryStringParameters?.['nextToken'];

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

    // Decode pagination token
    let exclusiveStartKey: Record<string, any> | undefined;
    if (nextToken) {
      try {
        exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
      } catch {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Invalid nextToken' }),
        };
      }
    }

    // Collect all matching items (paginated scan)
    const userUsage: Record<string, { requestCount: number; providers: Record<string, number> }> = {};
    let scannedPages = 0;
    let currentStartKey = exclusiveStartKey;

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
      scannedPages++;
    } while (currentStartKey);

    // Sort users by request count descending and paginate the result
    const sortedUsers = Object.entries(userUsage)
      .map(([userId, data]) => ({ userId, ...data }))
      .sort((a, b) => b.requestCount - a.requestCount);

    const startIndex = nextToken ? 0 : 0; // All data collected, just slice
    const page = sortedUsers.slice(0, limit);
    const hasMore = sortedUsers.length > limit;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        users: page,
        totalUsers: sortedUsers.length,
        nextToken: hasMore
          ? Buffer.from(JSON.stringify({ offset: limit })).toString('base64')
          : undefined,
      }),
    };
  } catch (error) {
    console.error('Failed to query users usage:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
