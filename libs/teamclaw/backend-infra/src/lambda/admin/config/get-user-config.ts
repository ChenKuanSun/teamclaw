import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';

const dynamodb = new DynamoDBClient({});
const CONFIG_TABLE = process.env['CONFIG_TABLE_NAME']!;

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
        body: JSON.stringify({ error: 'userId path parameter is required' }),
      };
    }

    const result = await dynamodb.send(new QueryCommand({
      TableName: CONFIG_TABLE,
      KeyConditionExpression: 'scopeKey = :sk',
      ExpressionAttributeValues: {
        ':sk': { S: `user#${userId}` },
      },
    }));

    const configs = (result.Items ?? []).map(item => ({
      configKey: item['configKey']?.S,
      value: item['value']?.S ? JSON.parse(item['value'].S) : null,
      updatedAt: item['updatedAt']?.S,
      updatedBy: item['updatedBy']?.S,
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ userId, configs }),
    };
  } catch (error) {
    console.error('Failed to get user config:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
