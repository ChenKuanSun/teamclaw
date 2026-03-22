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
  const from = queryStringParameters?.['from'] || queryStringParameters?.['startDate'];
  const to = queryStringParameters?.['to'] || queryStringParameters?.['endDate'] || new Date().toISOString();

  if (!from) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'from query parameter is required (ISO 8601 date)' },
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
    status: HttpStatusCode.SUCCESS,
    body: {
      dateRange: { from, to },
      byProvider: result,
    },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.GET,
  handlerFn,
);
