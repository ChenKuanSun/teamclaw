import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyHandler } from 'aws-lambda';

const dynamodb = new DynamoDBClient({});
const CONFIG_TABLE = process.env['CONFIG_TABLE_NAME']!;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const result = await dynamodb.send(new QueryCommand({
      TableName: CONFIG_TABLE,
      KeyConditionExpression: 'scopeKey = :sk',
      ExpressionAttributeValues: {
        ':sk': { S: 'global#default' },
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
      body: JSON.stringify({ configs }),
    };
  } catch (error) {
    console.error('Failed to get global config:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
