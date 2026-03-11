import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { adminLambdaHandlerDecorator, HandlerMethod, HttpStatusCode, validateRequiredEnvVars } from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars(['USAGE_TABLE_NAME']);

const dynamodb = new DynamoDBClient({});
const USAGE_TABLE = process.env['USAGE_TABLE_NAME']!;

export const handler = adminLambdaHandlerDecorator(HandlerMethod.GET, async () => {
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
    status: HttpStatusCode.OK,
    body: {
      totalRequests,
      byProvider: providerCounts,
    },
  };
});
