import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';

const dynamodb = new DynamoDBClient({});
const CONFIG_TABLE = process.env['CONFIG_TABLE_NAME']!;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const teamId = event.pathParameters?.['teamId'];
    if (!teamId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'teamId path parameter is required' }),
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
        scopeKey: { S: `team#${teamId}` },
        configKey: { S: configKey },
        value: { S: JSON.stringify(value) },
        updatedAt: { S: new Date().toISOString() },
        updatedBy: { S: updatedBy },
      },
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Team config updated', teamId, configKey }),
    };
  } catch (error) {
    console.error('Failed to update team config:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
