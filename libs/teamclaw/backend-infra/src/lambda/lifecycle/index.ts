import { ECSClient, RunTaskCommand, StopTaskCommand, DescribeTasksCommand } from '@aws-sdk/client-ecs';
import { EFSClient, CreateAccessPointCommand, DeleteAccessPointCommand } from '@aws-sdk/client-efs';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import {
  ElasticLoadBalancingV2Client,
  RegisterTargetsCommand,
  DeregisterTargetsCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import {
  SchedulerClient,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  ListSchedulesCommand,
} from '@aws-sdk/client-scheduler';
import { shiftCronBack2Min } from './cron-utils';

const ecsClient = new ECSClient({});
const efsClient = new EFSClient({});
const ddbClient = new DynamoDBClient({});
const elbv2Client = new ElasticLoadBalancingV2Client({});
const schedulerClient = new SchedulerClient({});

const SCHEDULE_GROUP = `teamclaw-cron-${process.env['DEPLOY_ENV']}`;

interface LifecycleEvent {
  action: 'start' | 'stop' | 'provision' | 'status' | 'sync-cron-schedules';
  userId: string;
  teamId?: string;
  cronSchedules?: string[];
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
    case 'sync-cron-schedules':
      return await syncCronSchedules(userId, event.cronSchedules || []);
    default:
      return { statusCode: 400, body: 'Unknown action' };
  }
};

async function provisionUser(userId: string, teamId?: string) {
  const accessPoint = await efsClient.send(new CreateAccessPointCommand({
    FileSystemId: process.env['EFS_FILE_SYSTEM_ID']!,
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

  try {
    await ddbClient.send(new PutItemCommand({
      TableName: process.env['USER_TABLE_NAME']!,
      Item: {
        userId: { S: userId },
        teamId: { S: teamId || '' },
        efsAccessPointId: { S: accessPoint.AccessPointId! },
        status: { S: 'provisioned' },
        createdAt: { S: new Date().toISOString() },
      },
      ConditionExpression: 'attribute_not_exists(userId)',
    }));
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      // User already provisioned — delete the orphaned access point
      await efsClient.send(new DeleteAccessPointCommand({
        AccessPointId: accessPoint.AccessPointId!,
      }));
      // Return existing access point ID
      const existing = await ddbClient.send(new GetItemCommand({
        TableName: process.env['USER_TABLE_NAME']!,
        Key: { userId: { S: userId } },
      }));
      return {
        statusCode: 200,
        body: JSON.stringify({
          accessPointId: existing.Item?.['efsAccessPointId']?.S,
          alreadyProvisioned: true,
        }),
      };
    }
    throw err;
  }

  return { statusCode: 200, body: JSON.stringify({ accessPointId: accessPoint.AccessPointId }) };
}

async function startContainer(userId: string) {
  const userRecord = await ddbClient.send(new GetItemCommand({
    TableName: process.env['USER_TABLE_NAME']!,
    Key: { userId: { S: userId } },
  }));

  if (!userRecord.Item) {
    return { statusCode: 404, body: 'User not found' };
  }

  // Skip if already running
  if (userRecord.Item['status']?.S === 'running' && userRecord.Item['taskArn']?.S) {
    const desc = await ecsClient.send(new DescribeTasksCommand({
      cluster: process.env['ECS_CLUSTER_NAME']!,
      tasks: [userRecord.Item['taskArn']!.S!],
    }));
    const task = desc.tasks?.[0];
    if (task && task.lastStatus !== 'STOPPED') {
      return { statusCode: 200, body: JSON.stringify({ taskArn: task.taskArn, alreadyRunning: true }) };
    }
  }

  const result = await ecsClient.send(new RunTaskCommand({
    cluster: process.env['ECS_CLUSTER_NAME']!,
    taskDefinition: `teamclaw-user-${process.env['DEPLOY_ENV']}`,
    launchType: 'FARGATE',
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: process.env['PRIVATE_SUBNET_IDS']!.split(','),
        securityGroups: [process.env['SECURITY_GROUP_ID']!],
        assignPublicIp: 'DISABLED',
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: 'teamclaw',
          environment: [
            { name: 'USER_ID', value: userId },
            { name: 'TEAM_ID', value: userRecord.Item['teamId']?.S || '' },
          ],
        },
        {
          name: 'proxy-sidecar',
          environment: [
            { name: 'API_KEYS_SECRET_ARN', value: process.env['API_KEYS_SECRET_ARN']! },
            { name: 'USAGE_TABLE_NAME', value: process.env['USAGE_TABLE_NAME'] || '' },
            { name: 'USER_ID', value: userId },
          ],
        },
      ],
    },
  }));

  const taskArn = result.tasks?.[0]?.taskArn;
  if (!taskArn) {
    const reason = result.failures?.[0]?.reason ?? 'unknown';
    return { statusCode: 503, body: JSON.stringify({ error: `ECS launch failed: ${reason}` }) };
  }

  // Wait for task to get a private IP and register with ALB target group
  let privateIp: string | undefined;
  const targetGroupArn = process.env['ALB_TARGET_GROUP_ARN'];
  if (targetGroupArn) {
    privateIp = await waitForTaskIp(taskArn);
    if (privateIp) {
      await elbv2Client.send(new RegisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [{ Id: privateIp, Port: 18789 }],
      }));
    }
  }

  await ddbClient.send(new PutItemCommand({
    TableName: process.env['USER_TABLE_NAME']!,
    Item: {
      ...userRecord.Item,
      taskArn: { S: taskArn },
      ...(privateIp ? { privateIp: { S: privateIp } } : {}),
      status: { S: 'running' },
    },
  }));

  return { statusCode: 200, body: JSON.stringify({ taskArn, privateIp }) };
}

async function waitForTaskIp(taskArn: string, maxAttempts = 20): Promise<string | undefined> {
  for (let i = 0; i < maxAttempts; i++) {
    const desc = await ecsClient.send(new DescribeTasksCommand({
      cluster: process.env['ECS_CLUSTER_NAME']!,
      tasks: [taskArn],
    }));
    const task = desc.tasks?.[0];
    if (!task) return undefined;
    if (task.lastStatus === 'STOPPED') return undefined;

    // Get private IP from ENI attachment
    const eniAttachment = task.attachments?.find(a => a.type === 'ElasticNetworkInterface');
    const privateIpDetail = eniAttachment?.details?.find(d => d.name === 'privateIPv4Address');
    if (privateIpDetail?.value) {
      return privateIpDetail.value;
    }

    // Wait 3 seconds before retrying
    await new Promise(r => setTimeout(r, 3000));
  }
  return undefined;
}

async function stopContainer(userId: string) {
  const userRecord = await ddbClient.send(new GetItemCommand({
    TableName: process.env['USER_TABLE_NAME']!,
    Key: { userId: { S: userId } },
  }));

  if (!userRecord.Item?.['taskArn']?.S) {
    return { statusCode: 404, body: 'No running container' };
  }

  // Deregister from ALB target group
  const targetGroupArn = process.env['ALB_TARGET_GROUP_ARN'];
  const privateIp = userRecord.Item['privateIp']?.S;
  if (targetGroupArn && privateIp) {
    try {
      await elbv2Client.send(new DeregisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: [{ Id: privateIp, Port: 18789 }],
      }));
    } catch {
      // Best-effort deregistration
    }
  }

  await ecsClient.send(new StopTaskCommand({
    cluster: process.env['ECS_CLUSTER_NAME']!,
    task: userRecord.Item['taskArn']!.S!,
    reason: 'User-initiated stop or idle timeout',
  }));

  await ddbClient.send(new PutItemCommand({
    TableName: process.env['USER_TABLE_NAME']!,
    Item: {
      ...userRecord.Item,
      taskArn: { S: '' },
      privateIp: { S: '' },
      status: { S: 'stopped' },
    },
  }));

  return { statusCode: 200, body: 'Stopped' };
}

async function getStatus(userId: string) {
  const userRecord = await ddbClient.send(new GetItemCommand({
    TableName: process.env['USER_TABLE_NAME']!,
    Key: { userId: { S: userId } },
  }));

  if (!userRecord.Item) {
    return { statusCode: 404, body: 'User not found' };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      userId,
      status: userRecord.Item['status']?.S,
      taskArn: userRecord.Item['taskArn']?.S || null,
    }),
  };
}

/**
 * Sync EventBridge Scheduler rules for a user's OpenClaw CronJobs.
 * Called when admin updates a user's openclaw.json cron configuration.
 *
 * Creates one EventBridge schedule per cron expression, each firing
 * 2 minutes before the cron time to pre-wake the container.
 * OpenClaw's internal cron scheduler then fires naturally.
 */
async function syncCronSchedules(userId: string, cronSchedules: string[]) {
  const schedulePrefix = `${userId}-cron-`;

  // Delete existing schedules for this user
  const existing = await schedulerClient.send(new ListSchedulesCommand({
    GroupName: SCHEDULE_GROUP,
    NamePrefix: schedulePrefix,
  }));

  for (const schedule of existing.Schedules || []) {
    await schedulerClient.send(new DeleteScheduleCommand({
      Name: schedule.Name!,
      GroupName: SCHEDULE_GROUP,
    }));
  }

  // Create new schedules (each fires 2 min early to allow container boot)
  const created: string[] = [];
  for (let i = 0; i < cronSchedules.length; i++) {
    const cronExpr = cronSchedules[i];
    const scheduleName = `${schedulePrefix}${i}`;

    await schedulerClient.send(new CreateScheduleCommand({
      Name: scheduleName,
      GroupName: SCHEDULE_GROUP,
      ScheduleExpression: `cron(${shiftCronBack2Min(cronExpr)})`,
      FlexibleTimeWindow: { Mode: 'OFF' },
      Target: {
        Arn: process.env['LIFECYCLE_LAMBDA_ARN']!,
        RoleArn: process.env['SCHEDULER_ROLE_ARN']!,
        Input: JSON.stringify({ action: 'start', userId }),
      },
    }));
    created.push(scheduleName);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      userId,
      schedulesDeleted: existing.Schedules?.length || 0,
      schedulesCreated: created.length,
    }),
  };
}

