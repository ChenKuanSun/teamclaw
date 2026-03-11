import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';

const dynamodb = new DynamoDBClient({});
const USERS_TABLE = process.env['USERS_TABLE_NAME']!;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env['ADMIN_ORIGIN'] || '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const userId = event.pathParameters?.['userId'];

    if (!userId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing userId path parameter' }),
      };
    }

    const result = await dynamodb.send(new GetItemCommand({
      TableName: USERS_TABLE,
      Key: { userId: { S: userId } },
    }));

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    const item = result.Item;
    const user = {
      userId: item['userId']?.S,
      teamId: item['teamId']?.S,
      email: item['email']?.S,
      displayName: item['displayName']?.S,
      status: item['status']?.S,
      efsAccessPointId: item['efsAccessPointId']?.S,
      taskArn: item['taskArn']?.S,
      createdAt: item['createdAt']?.S,
      updatedAt: item['updatedAt']?.S,
    };

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(user),
    };
  } catch (error) {
    console.error('Failed to get user:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
