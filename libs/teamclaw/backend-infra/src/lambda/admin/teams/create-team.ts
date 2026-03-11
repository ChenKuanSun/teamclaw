import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';

const ddbClient = new DynamoDBClient({});
const TABLE_NAME = process.env['TEAMS_TABLE_NAME']!;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env['ADMIN_ORIGIN'] || '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler = async (event: any) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};

    if (!body.name) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing required field: name' }),
      };
    }

    const teamId = randomUUID();
    const now = new Date().toISOString();

    await ddbClient.send(new PutItemCommand({
      TableName: TABLE_NAME,
      Item: {
        teamId: { S: teamId },
        name: { S: body.name },
        description: { S: body.description || '' },
        createdAt: { S: now },
        updatedAt: { S: now },
      },
    }));

    return {
      statusCode: 201,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        teamId,
        name: body.name,
        description: body.description || '',
        createdAt: now,
        updatedAt: now,
      }),
    };
  } catch (error) {
    console.error('Error creating team:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to create team' }),
    };
  }
};
