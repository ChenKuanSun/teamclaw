import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

const ddbClient = new DynamoDBClient({});
const TABLE_NAME = process.env['TEAMS_TABLE_NAME']!;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env['ADMIN_ORIGIN'] || '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler = async (event: any) => {
  try {
    const qs = event.queryStringParameters || {};
    const nameFilter = qs.name as string | undefined;
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

    if (nameFilter) {
      params.FilterExpression = 'contains(#n, :name)';
      params.ExpressionAttributeNames = { '#n': 'name' };
      params.ExpressionAttributeValues = { ':name': { S: nameFilter } };
    }

    const result = await ddbClient.send(new ScanCommand(params));

    const teams = (result.Items || []).map((item) => ({
      teamId: item['teamId']?.S,
      name: item['name']?.S,
      description: item['description']?.S,
      memberCount: item['memberIds']?.SS?.length || 0,
      createdAt: item['createdAt']?.S,
      updatedAt: item['updatedAt']?.S,
    }));

    const nextToken = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ teams, nextToken }),
    };
  } catch (error) {
    console.error('Error querying teams:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to query teams' }),
    };
  }
};
