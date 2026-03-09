import { ECSClient, RunTaskCommand, StopTaskCommand, DescribeTasksCommand } from '@aws-sdk/client-ecs';
import { EFSClient, CreateAccessPointCommand } from '@aws-sdk/client-efs';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const ecsClient = new ECSClient({});
const efsClient = new EFSClient({});
const ddbClient = new DynamoDBClient({});

interface LifecycleEvent {
  action: 'start' | 'stop' | 'provision' | 'status';
  userId: string;
  teamId?: string;
}

export const handler = async (event: LifecycleEvent) => {
  const { action, userId } = event;

  switch (action) {
    case 'provision':
      return await provisionUser(userId, event.teamId);
    case 'start':
      return await startContainer(userId);
    case 'stop':
      return await stopContainer(userId);
    case 'status':
      return await getStatus(userId);
    default:
      return { statusCode: 400, body: 'Unknown action' };
  }
};

async function provisionUser(userId: string, teamId?: string) {
  // Create EFS Access Point for user
  const accessPoint = await efsClient.send(new CreateAccessPointCommand({
    FileSystemId: process.env.EFS_FILE_SYSTEM_ID!,
    PosixUser: { Uid: 1000, Gid: 1000 },
    RootDirectory: {
      Path: `/users/${userId}`,
      CreationInfo: { OwnerUid: 1000, OwnerGid: 1000, Permissions: '0750' },
    },
    Tags: [
      { Key: 'UserId', Value: userId },
      { Key: 'TeamId', Value: teamId || '' },
    ],
  }));

  // Save user record
  await ddbClient.send(new PutItemCommand({
    TableName: process.env.USER_TABLE_NAME!,
    Item: {
      userId: { S: userId },
      teamId: { S: teamId || '' },
      efsAccessPointId: { S: accessPoint.AccessPointId! },
      status: { S: 'provisioned' },
      createdAt: { S: new Date().toISOString() },
    },
  }));

  return { statusCode: 200, body: JSON.stringify({ accessPointId: accessPoint.AccessPointId }) };
}

async function startContainer(userId: string) {
  // Get user record
  const userRecord = await ddbClient.send(new GetItemCommand({
    TableName: process.env.USER_TABLE_NAME!,
    Key: { userId: { S: userId } },
  }));

  if (!userRecord.Item) {
    return { statusCode: 404, body: 'User not found' };
  }

  // RunTask with user-specific config
  const result = await ecsClient.send(new RunTaskCommand({
    cluster: process.env.ECS_CLUSTER_NAME!,
    taskDefinition: `openclaw-user-${process.env.DEPLOY_ENV}`,
    launchType: 'FARGATE',
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: [], // Populated from SSM at deploy time
        securityGroups: [],
        assignPublicIp: 'DISABLED',
      },
    },
    overrides: {
      containerOverrides: [{
        name: 'openclaw',
        environment: [
          { name: 'USER_ID', value: userId },
          { name: 'TEAM_ID', value: userRecord.Item.teamId?.S || '' },
          { name: 'KEY_POOL_PROXY_URL', value: process.env.KEY_POOL_PROXY_URL! },
        ],
      }],
    },
  }));

  const taskArn = result.tasks?.[0]?.taskArn;

  // Update user record with task ARN
  await ddbClient.send(new PutItemCommand({
    TableName: process.env.USER_TABLE_NAME!,
    Item: {
      ...userRecord.Item,
      taskArn: { S: taskArn || '' },
      status: { S: 'running' },
    },
  }));

  return { statusCode: 200, body: JSON.stringify({ taskArn }) };
}

async function stopContainer(userId: string) {
  const userRecord = await ddbClient.send(new GetItemCommand({
    TableName: process.env.USER_TABLE_NAME!,
    Key: { userId: { S: userId } },
  }));

  if (!userRecord.Item?.taskArn?.S) {
    return { statusCode: 404, body: 'No running container' };
  }

  await ecsClient.send(new StopTaskCommand({
    cluster: process.env.ECS_CLUSTER_NAME!,
    task: userRecord.Item.taskArn.S,
    reason: 'User-initiated stop or idle timeout',
  }));

  await ddbClient.send(new PutItemCommand({
    TableName: process.env.USER_TABLE_NAME!,
    Item: {
      ...userRecord.Item,
      taskArn: { S: '' },
      status: { S: 'stopped' },
    },
  }));

  return { statusCode: 200, body: 'Stopped' };
}

async function getStatus(userId: string) {
  const userRecord = await ddbClient.send(new GetItemCommand({
    TableName: process.env.USER_TABLE_NAME!,
    Key: { userId: { S: userId } },
  }));

  if (!userRecord.Item) {
    return { statusCode: 404, body: 'User not found' };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      userId,
      status: userRecord.Item.status?.S,
      taskArn: userRecord.Item.taskArn?.S || null,
    }),
  };
}
