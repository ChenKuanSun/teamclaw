import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
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

    const body = JSON.parse(event.body || '{}');
    const { configKey, value } = body;

    if (!configKey || value === undefined) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'configKey and value are required' }),
      };
    }

    const updatedBy = event.requestContext?.authorizer?.['claims']?.sub || 'admin';

    await dynamodb.send(new PutItemCommand({
      TableName: CONFIG_TABLE,
      Item: {
        scopeKey: { S: `user#${userId}` },
        configKey: { S: configKey },
        value: { S: JSON.stringify(value) },
        updatedAt: { S: new Date().toISOString() },
        updatedBy: { S: updatedBy },
      },
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'User config updated', userId, configKey }),
    };
  } catch (error) {
    console.error('Failed to update user config:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
