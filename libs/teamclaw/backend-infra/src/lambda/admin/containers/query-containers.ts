import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

const ddbClient = new DynamoDBClient({});
const TABLE_NAME = process.env.USERS_TABLE_NAME!;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler = async (event: any) => {
  try {
    const qs = event.queryStringParameters || {};
    const limit = qs.limit ? parseInt(qs.limit, 10) : 25;
    const exclusiveStartKey = qs.nextToken
      ? JSON.parse(Buffer.from(qs.nextToken, 'base64').toString())
      : undefined;

    const params: any = {
      TableName: TABLE_NAME,
      Limit: limit,
    };

    if (exclusiveStartKey) {
      params.ExclusiveStartKey = exclusiveStartKey;
    }

    const result = await ddbClient.send(new ScanCommand(params));

    const containers = (result.Items || []).map((item) => ({
      userId: item.userId?.S,
      email: item.email?.S || null,
      displayName: item.displayName?.S || null,
      teamId: item.teamId?.S || null,
      status: item.status?.S || 'unknown',
      taskArn: item.taskArn?.S || null,
    }));

    const nextToken = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ containers, nextToken }),
    };
  } catch (error) {
    console.error('Error querying containers:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to query containers' }),
    };
  }
};
