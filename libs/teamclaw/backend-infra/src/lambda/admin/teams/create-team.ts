import { DynamoDBClient, PutItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars(['TEAMS_TABLE_NAME']);

const ddbClient = new DynamoDBClient({});
const TABLE_NAME = process.env['TEAMS_TABLE_NAME']!;

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.POST,
  async (event) => {
    const body = event.body ? JSON.parse(event.body) : {};

    if (!body.name) {
      return {
        status: HttpStatusCode.BAD_REQUEST,
        body: { message: 'Missing required field: name' },
      };
    }

    // Check for duplicate team name
    const existingTeams = await ddbClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: '#name = :name',
      ExpressionAttributeNames: { '#name': 'name' },
      ExpressionAttributeValues: { ':name': { S: body.name } },
    }));

    if (existingTeams.Items && existingTeams.Items.length > 0) {
      return {
        status: HttpStatusCode.CONFLICT,
        body: { message: `Team with name "${body.name}" already exists` },
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
      status: HttpStatusCode.CREATED,
      body: {
        teamId,
        name: body.name,
        description: body.description || '',
        createdAt: now,
        updatedAt: now,
      },
    };
  },
);
