import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env['USAGE_TABLE_NAME'];
const USER_ID = process.env['USER_ID'] || 'unknown';

export interface UsageMeta {
  downgradeReason?: 'oauth-no-1m';
}

export async function logUsage(provider: string, model: string, meta?: UsageMeta): Promise<void> {
  if (!TABLE_NAME) return;

  const now = new Date();
  const ttl = Math.floor(now.getTime() / 1000) + 90 * 24 * 60 * 60;

  const item: Record<string, { S: string } | { N: string }> = {
    userId: { S: USER_ID },
    timestamp: { S: `${now.toISOString()}-${Math.random().toString(36).substring(2, 8)}` },
    provider: { S: provider },
    model: { S: model },
    ttl: { N: String(ttl) },
  };

  if (meta?.downgradeReason) {
    item['downgradeReason'] = { S: meta.downgradeReason };
  }

  try {
    await ddb.send(new PutItemCommand({
      TableName: TABLE_NAME,
      Item: item,
    }));
  } catch (err) {
    console.error('[sidecar] Usage log failed:', err);
  }
}
