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

    if (!from) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'from query parameter is required (ISO 8601 date)' }),
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
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        dateRange: { from, to },
        totalRequests,
        uniqueUsers: uniqueUsers.size,
        byProvider,
      }),
    };
  } catch (error) {
    console.error('Failed to get system analytics:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
