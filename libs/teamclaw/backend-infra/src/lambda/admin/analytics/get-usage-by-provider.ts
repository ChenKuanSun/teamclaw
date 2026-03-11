import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';

const dynamodb = new DynamoDBClient({});
const USAGE_TABLE = process.env['USAGE_TABLE_NAME']!;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env['ADMIN_ORIGIN'] || '*',
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

    // provider -> date -> count
    const timeSeries: Record<string, Record<string, number>> = {};
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
        const provider = item['provider']?.S || 'unknown';
        const timestamp = item['timestamp']?.S || '';
        const date = timestamp.split('T')[0]; // Extract YYYY-MM-DD

        if (!timeSeries[provider]) {
          timeSeries[provider] = {};
        }
        timeSeries[provider][date] = (timeSeries[provider][date] || 0) + 1;
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Convert to sorted time series arrays
    const result: Record<string, { date: string; count: number }[]> = {};
    for (const [provider, dateCounts] of Object.entries(timeSeries)) {
      result[provider] = Object.entries(dateCounts)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        dateRange: { from, to },
        byProvider: result,
      }),
    };
  } catch (error) {
    console.error('Failed to get usage by provider:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
