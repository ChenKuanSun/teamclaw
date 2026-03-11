import { DynamoDBClient, GetItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { EFSClient, DeleteAccessPointCommand } from '@aws-sdk/client-efs';
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  adminLambdaHandlerDecorator,
  HandlerMethod,
  HttpStatusCode,
  validateRequiredEnvVars,
} from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars(['USERS_TABLE_NAME', 'LIFECYCLE_FUNCTION_NAME', 'COGNITO_USER_POOL_ID']);

const dynamodb = new DynamoDBClient({});
const lambda = new LambdaClient({});
const efs = new EFSClient({});
const cognito = new CognitoIdentityProviderClient({});

const USERS_TABLE = process.env['USERS_TABLE_NAME']!;
const LIFECYCLE_FUNCTION_NAME = process.env['LIFECYCLE_FUNCTION_NAME']!;
const USER_POOL_ID = process.env['COGNITO_USER_POOL_ID']!;

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.DELETE,
  async (event) => {
    const userId = event.pathParameters?.['userId'];

    if (!userId) {
      return {
        status: HttpStatusCode.BAD_REQUEST,
        body: { message: 'Missing userId path parameter' },
      };
    }

    // Verify user exists
    const userResult = await dynamodb.send(new GetItemCommand({
      TableName: USERS_TABLE,
      Key: { userId: { S: userId } },
    }));

    if (!userResult.Item) {
      return {
        status: HttpStatusCode.NOT_FOUND,
        body: { message: 'User not found' },
      };
    }

    const item = userResult.Item;

    // Stop container if running (synchronous — wait for stop before deleting records)
    if (item['status']?.S === 'running' && item['taskArn']?.S) {
      try {
        await lambda.send(new InvokeCommand({
          FunctionName: LIFECYCLE_FUNCTION_NAME,
          InvocationType: 'RequestResponse',
          Payload: Buffer.from(JSON.stringify({ action: 'stop', userId })),
        }));
      } catch (stopError) {
        console.error('Failed to invoke lifecycle Lambda for stop:', stopError);
      }
    }

    // Delete EFS access point
    const accessPointId = item['efsAccessPointId']?.S;
    if (accessPointId) {
      try {
        await efs.send(new DeleteAccessPointCommand({
          AccessPointId: accessPointId,
        }));
      } catch (efsError) {
        console.error('Failed to delete EFS access point:', efsError);
      }
    }

    // Delete Cognito user
    try {
      await cognito.send(new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: userId,
      }));
    } catch (cognitoError) {
      console.error('Failed to delete Cognito user:', cognitoError);
    }

    // Delete DynamoDB record
    await dynamodb.send(new DeleteItemCommand({
      TableName: USERS_TABLE,
      Key: { userId: { S: userId } },
    }));

    return {
      status: HttpStatusCode.ACCEPTED,
      body: {
        message: 'User deletion initiated',
        userId,
      },
    };
  },
);
