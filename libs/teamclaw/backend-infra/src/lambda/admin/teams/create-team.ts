import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
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
