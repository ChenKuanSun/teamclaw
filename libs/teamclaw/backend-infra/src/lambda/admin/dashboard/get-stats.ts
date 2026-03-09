import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';

const dynamodb = new DynamoDBClient({});
const USERS_TABLE = process.env['USERS_TABLE_NAME']!;
const USAGE_TABLE = process.env['USAGE_TABLE_NAME']!;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler: APIGatewayProxyHandler = async () => {
  try {
    // Scan users table for counts
    const usersResult = await dynamodb.send(new ScanCommand({ TableName: USERS_TABLE }));
    const users = usersResult.Items ?? [];

    const totalUsers = users.length;
    const runningContainers = users.filter(u => u['status']?.S === 'running').length;
    const stoppedContainers = users.filter(u => u['status']?.S === 'stopped').length;
    const provisionedContainers = users.filter(u => u['status']?.S === 'provisioned').length;

    // Count usage requests in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let totalRequests24h = 0;

    // Scan usage table filtering by timestamp >= 24h ago
    let lastEvaluatedKey: Record<string, any> | undefined;
    do {
      const usageResult = await dynamodb.send(new ScanCommand({
        TableName: USAGE_TABLE,
        FilterExpression: '#ts >= :since',
        ExpressionAttributeNames: { '#ts': 'timestamp' },
        ExpressionAttributeValues: { ':since': { S: oneDayAgo } },
        ExclusiveStartKey: lastEvaluatedKey,
      }));
      totalRequests24h += usageResult.Count ?? 0;
      lastEvaluatedKey = usageResult.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        totalUsers,
        containers: {
          running: runningContainers,
          stopped: stoppedContainers,
          provisioned: provisionedContainers,
        },
        totalRequests24h,
      }),
    };
  } catch (error) {
    console.error('Failed to get dashboard stats:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
