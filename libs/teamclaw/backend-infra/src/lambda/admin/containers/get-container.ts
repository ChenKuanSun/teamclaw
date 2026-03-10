import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

const ddbClient = new DynamoDBClient({});
const TABLE_NAME = process.env['USERS_TABLE_NAME']!;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler = async (event: any) => {
  try {
    const userId = event.pathParameters?.userId;

    if (!userId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing userId path parameter' }),
      };
    }

    const result = await ddbClient.send(new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { userId: { S: userId } },
    }));

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Container not found' }),
      };
    }

    const item = result.Item;
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        userId: item['userId']?.S,
        email: item['email']?.S || null,
        displayName: item['displayName']?.S || null,
        teamId: item['teamId']?.S || null,
        efsAccessPointId: item['efsAccessPointId']?.S || null,
        status: item['status']?.S || 'unknown',
        taskArn: item['taskArn']?.S || null,
        createdAt: item['createdAt']?.S,
        updatedAt: item['updatedAt']?.S,
      }),
    };
  } catch (error) {
    console.error('Error getting container:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to get container' }),
    };
  }
};
