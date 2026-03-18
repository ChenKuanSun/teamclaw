import { ECSClient, RunTaskCommand, StopTaskCommand, DescribeTasksCommand } from '@aws-sdk/client-ecs';
import { EFSClient, CreateAccessPointCommand, DeleteAccessPointCommand } from '@aws-sdk/client-efs';
import { DynamoDBClient, GetItemCommand, PutItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import {
  ElasticLoadBalancingV2Client,
  RegisterTargetsCommand,
  DeregisterTargetsCommand,
  CreateTargetGroupCommand,
  DeleteTargetGroupCommand,
  CreateRuleCommand,
  DeleteRuleCommand,
  DescribeTargetGroupsCommand,
  DescribeRulesCommand,
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
  action: 'start' | 'stop' | 'provision' | 'status' | 'sync-cron-schedules' | 'check-idle';
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
    case 'check-idle':
      return await checkIdleContainers();
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
      TableName: process.env['USERS_TABLE_NAME']!,
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
      // User record already exists (created by user-session with status 'provisioning')
      // Delete the orphaned access point we just created
      await efsClient.send(new DeleteAccessPointCommand({
        AccessPointId: accessPoint.AccessPointId!,
      }));

      const existing = await ddbClient.send(new GetItemCommand({
        TableName: process.env['USERS_TABLE_NAME']!,
        Key: { userId: { S: userId } },
      }));

      const existingStatus = existing.Item?.['status']?.S;
      if (existingStatus === 'provisioning') {
        // user-session created the record but provisioning wasn't completed.
        // Update status and store the access point ID, then start the container.
        const newAccessPoint = await efsClient.send(new CreateAccessPointCommand({
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

        await ddbClient.send(new PutItemCommand({
          TableName: process.env['USERS_TABLE_NAME']!,
          Item: {
            ...existing.Item!,
            efsAccessPointId: { S: newAccessPoint.AccessPointId! },
            status: { S: 'provisioned' },
          },
        }));

        const startResult = await startContainer(userId);
        return {
          statusCode: 200,
          body: JSON.stringify({
            accessPointId: newAccessPoint.AccessPointId,
            startResult: JSON.parse(startResult.body as string),
          }),
        };
      }

      // Already fully provisioned — just return existing info
      if (existingStatus === 'stopped' || existingStatus === 'provisioned') {
        const startResult = await startContainer(userId);
        return {
          statusCode: 200,
          body: JSON.stringify({
            accessPointId: existing.Item?.['efsAccessPointId']?.S,
            alreadyProvisioned: true,
            startResult: JSON.parse(startResult.body as string),
          }),
        };
      }

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

  // After provisioning, immediately start the container
  const startResult = await startContainer(userId);
  return {
    statusCode: 200,
    body: JSON.stringify({
      accessPointId: accessPoint.AccessPointId,
      startResult: JSON.parse(startResult.body as string),
    }),
  };
}

/**
 * Derive a short, ALB-safe target group name from a userId.
 * TG names: max 32 chars, alphanumeric + hyphens only, no leading/trailing hyphen.
 */
function userTgName(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 20);
  return `tc-u-${safe}`;
}

/** Derive the ALB path pattern for a user: /u/{shortId}* */
function userPathPattern(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 40);
  return `/u/${safe}*`;
}

/** Ensure a per-user target group exists, creating it if needed. Returns the TG ARN. */
async function ensureUserTargetGroup(userId: string): Promise<string> {
  const tgName = userTgName(userId);

  // Check if it already exists
  try {
    const desc = await elbv2Client.send(new DescribeTargetGroupsCommand({ Names: [tgName] }));
    if (desc.TargetGroups?.[0]?.TargetGroupArn) {
      return desc.TargetGroups[0].TargetGroupArn;
    }
  } catch (err: any) {
    // TargetGroupNotFound is expected for first-time creation
    if (err.name !== 'TargetGroupNotFoundException') throw err;
  }

  const tg = await elbv2Client.send(new CreateTargetGroupCommand({
    Name: tgName,
    Protocol: 'HTTP',
    Port: 18789,
    VpcId: process.env['VPC_ID']!,
    TargetType: 'ip',
    HealthCheckEnabled: true,
    HealthCheckPath: '/health',
    HealthCheckPort: '18789',
    HealthyThresholdCount: 2,
    UnhealthyThresholdCount: 3,
    HealthCheckIntervalSeconds: 15,
    HealthCheckTimeoutSeconds: 5,
    Tags: [
      { Key: 'UserId', Value: userId },
      { Key: 'ManagedBy', Value: 'teamclaw-lifecycle' },
    ],
  }));

  return tg.TargetGroups![0].TargetGroupArn!;
}

/**
 * Ensure an ALB listener rule routes /u/{userId}* to the user's target group.
 * Returns the rule ARN (existing or newly created).
 */
async function ensureListenerRule(userId: string, targetGroupArn: string): Promise<string> {
  const listenerArn = process.env['ALB_LISTENER_ARN']!;
  const pathPattern = userPathPattern(userId);

  // Check for existing rule by listing all rules and matching our path pattern
  const existingRules = await elbv2Client.send(new DescribeRulesCommand({ ListenerArn: listenerArn }));
  for (const rule of existingRules.Rules || []) {
    if (rule.IsDefault) continue;
    const pathCond = rule.Conditions?.find(c => c.Field === 'path-pattern');
    if (pathCond?.Values?.includes(pathPattern)) {
      return rule.RuleArn!;
    }
  }

  // Determine next available priority (non-default rules)
  const usedPriorities = (existingRules.Rules || [])
    .filter(r => !r.IsDefault && r.Priority)
    .map(r => parseInt(r.Priority!, 10))
    .filter(n => !isNaN(n));
  const nextPriority = usedPriorities.length > 0 ? Math.max(...usedPriorities) + 1 : 1;

  const rule = await elbv2Client.send(new CreateRuleCommand({
    ListenerArn: listenerArn,
    Priority: nextPriority,
    Conditions: [
      {
        Field: 'path-pattern',
        Values: [pathPattern],
      },
    ],
    Actions: [
      {
        Type: 'forward',
        TargetGroupArn: targetGroupArn,
      },
    ],
    Tags: [
      { Key: 'UserId', Value: userId },
      { Key: 'ManagedBy', Value: 'teamclaw-lifecycle' },
    ],
  }));

  return rule.Rules![0].RuleArn!;
}

async function startContainer(userId: string) {
  const userRecord = await ddbClient.send(new GetItemCommand({
    TableName: process.env['USERS_TABLE_NAME']!,
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
            { name: 'API_KEYS_SECRET_ARN', value: process.env['API_KEYS_SECRET_ARN']! },
            { name: 'ALLOWED_ORIGINS', value: process.env['ALLOWED_ORIGINS'] || '' },
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

  // Wait for task to get a private IP
  let privateIp: string | undefined;
  let userTargetGroupArn: string | undefined;
  let listenerRuleArn: string | undefined;

  privateIp = await waitForTaskIp(taskArn);
  if (privateIp && process.env['ALB_LISTENER_ARN'] && process.env['VPC_ID']) {
    // Create per-user target group + ALB listener rule for path-based routing
    userTargetGroupArn = await ensureUserTargetGroup(userId);
    await elbv2Client.send(new RegisterTargetsCommand({
      TargetGroupArn: userTargetGroupArn,
      Targets: [{ Id: privateIp, Port: 18789 }],
    }));
    listenerRuleArn = await ensureListenerRule(userId, userTargetGroupArn);
  } else if (privateIp && process.env['ALB_TARGET_GROUP_ARN']) {
    // Fallback: register to shared target group (legacy behavior)
    await elbv2Client.send(new RegisterTargetsCommand({
      TargetGroupArn: process.env['ALB_TARGET_GROUP_ARN'],
      Targets: [{ Id: privateIp, Port: 18789 }],
    }));
  }

  await ddbClient.send(new PutItemCommand({
    TableName: process.env['USERS_TABLE_NAME']!,
    Item: {
      ...userRecord.Item,
      taskArn: { S: taskArn },
      ...(privateIp ? { privateIp: { S: privateIp } } : {}),
      ...(userTargetGroupArn ? { targetGroupArn: { S: userTargetGroupArn } } : {}),
      ...(listenerRuleArn ? { listenerRuleArn: { S: listenerRuleArn } } : {}),
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
    TableName: process.env['USERS_TABLE_NAME']!,
    Key: { userId: { S: userId } },
  }));

  if (!userRecord.Item?.['taskArn']?.S) {
    return { statusCode: 404, body: 'No running container' };
  }

  const privateIp = userRecord.Item['privateIp']?.S;
  const userTgArn = userRecord.Item['targetGroupArn']?.S;
  const ruleArn = userRecord.Item['listenerRuleArn']?.S;

  // Deregister from per-user target group and clean up ALB resources
  if (userTgArn && privateIp) {
    try {
      await elbv2Client.send(new DeregisterTargetsCommand({
        TargetGroupArn: userTgArn,
        Targets: [{ Id: privateIp, Port: 18789 }],
      }));
    } catch {
      // Best-effort deregistration
    }

    // Delete listener rule first (must be removed before target group)
    if (ruleArn) {
      try {
        await elbv2Client.send(new DeleteRuleCommand({ RuleArn: ruleArn }));
      } catch {
        // Best-effort cleanup
      }
    }

    // Delete per-user target group
    try {
      await elbv2Client.send(new DeleteTargetGroupCommand({ TargetGroupArn: userTgArn }));
    } catch {
      // Best-effort cleanup — TG may still have draining targets
    }
  } else if (process.env['ALB_TARGET_GROUP_ARN'] && privateIp) {
    // Fallback: deregister from shared target group (legacy behavior)
    try {
      await elbv2Client.send(new DeregisterTargetsCommand({
        TargetGroupArn: process.env['ALB_TARGET_GROUP_ARN'],
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
    TableName: process.env['USERS_TABLE_NAME']!,
    Item: {
      ...userRecord.Item,
      taskArn: { S: '' },
      privateIp: { S: '' },
      targetGroupArn: { S: '' },
      listenerRuleArn: { S: '' },
      status: { S: 'stopped' },
    },
  }));

  return { statusCode: 200, body: 'Stopped' };
}

async function getStatus(userId: string) {
  const userRecord = await ddbClient.send(new GetItemCommand({
    TableName: process.env['USERS_TABLE_NAME']!,
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

/**
 * Scan for running containers that have been idle for longer than the timeout
 * and stop them to save costs.
 */
async function checkIdleContainers() {
  const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  const now = Date.now();

  const result = await ddbClient.send(new ScanCommand({
    TableName: process.env['USERS_TABLE_NAME']!,
    FilterExpression: '#s = :running',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':running': { S: 'running' } },
  }));

  let stopped = 0;
  for (const item of result.Items || []) {
    const lastActive = item['lastActiveAt']?.S;
    const lastActiveMs = lastActive ? new Date(lastActive).getTime() : 0;

    if (now - lastActiveMs > IDLE_TIMEOUT_MS) {
      const userId = item['userId']?.S;
      if (userId) {
        await stopContainer(userId);
        stopped++;
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ checked: result.Items?.length || 0, stopped }) };
}

