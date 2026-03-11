import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';

const dynamodb = new DynamoDBClient({});
const USAGE_TABLE = process.env['USAGE_TABLE_NAME']!;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env['ADMIN_ORIGIN'] || '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const providerCounts: Record<string, number> = {};
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      const result = await dynamodb.send(new ScanCommand({
        TableName: USAGE_TABLE,
        ProjectionExpression: 'provider',
        ExclusiveStartKey: lastEvaluatedKey,
      }));

      for (const item of result.Items ?? []) {
        const provider = item['provider']?.S || 'unknown';
        providerCounts[provider] = (providerCounts[provider] || 0) + 1;
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    const totalRequests = Object.values(providerCounts).reduce((sum, c) => sum + c, 0);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        totalRequests,
        byProvider: providerCounts,
      }),
    };
  } catch (error) {
    console.error('Failed to get key usage stats:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
