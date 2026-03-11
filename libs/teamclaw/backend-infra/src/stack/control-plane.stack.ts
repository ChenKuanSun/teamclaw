import {
  Stack,
  aws_cognito,
  aws_lambda_nodejs,
  aws_apigateway,
  aws_dynamodb,
  aws_iam,
  aws_ssm,
  aws_secretsmanager,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackPropsWithEnv, TC_SSM_PARAMETER } from '@TeamClaw/core/cloud-config';
import { TC_LAMBDA_DEFAULT_PROPS, TC_LIFECYCLE_LAMBDA_PROPS } from '@TeamClaw/teamclaw/cloud-config';
import { LAMBDA_ENTRY_PATH } from '../lambda';

export class ControlPlaneStack extends Stack {
  constructor(scope: Construct, id: string, props: StackPropsWithEnv) {
    super(scope, id, props);
    const { deployEnv } = props;
    const ssm = TC_SSM_PARAMETER[deployEnv];

    // ─── Cognito ───
    const userPool = new aws_cognito.UserPool(this, 'UserPool', {
      userPoolName: `teamclaw-${deployEnv}`,
      selfSignUpEnabled: false, // Admin-only user creation
      signInAliases: { email: true },
      autoVerify: { email: true },
      mfa: aws_cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: aws_cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: {
        userSrp: true,
      },
      generateSecret: false,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    new aws_ssm.StringParameter(this, 'UserPoolIdParam', {
      parameterName: ssm.COGNITO.USER_POOL_ID,
      stringValue: userPool.userPoolId,
    });
    new aws_ssm.StringParameter(this, 'UserPoolArnParam', {
      parameterName: ssm.COGNITO.USER_POOL_ARN,
      stringValue: userPool.userPoolArn,
    });
    new aws_ssm.StringParameter(this, 'UserPoolClientIdParam', {
      parameterName: ssm.COGNITO.USER_POOL_CLIENT_ID,
      stringValue: userPoolClient.userPoolClientId,
    });

    // ─── DynamoDB: User-Container mapping & usage tracking ───
    // TODO: [Affiora compliance] Consider migrating to TableV2 for consistency.
    // Cannot change in-place as it changes CloudFormation resource type and destroys the table.
    const userTable = new aws_dynamodb.Table(this, 'UserTable', {
      tableName: `teamclaw-users-${deployEnv}`,
      partitionKey: { name: 'userId', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // TODO: [Affiora compliance] Consider migrating to TableV2 for consistency.
    // Cannot change in-place as it changes CloudFormation resource type and destroys the table.
    const usageTable = new aws_dynamodb.Table(this, 'UsageTable', {
      tableName: `teamclaw-usage-${deployEnv}`,
      partitionKey: { name: 'userId', type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: aws_dynamodb.AttributeType.STRING },
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'ttl',
    });

    // ─── DynamoDB: Teams & Config ───
    const teamsTable = new aws_dynamodb.TableV2(this, 'TeamsTable', {
      tableName: `teamclaw-teams-${deployEnv}`,
      partitionKey: { name: 'teamId', type: aws_dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.RETAIN,
      billing: aws_dynamodb.Billing.onDemand(),
    });

    const configTable = new aws_dynamodb.TableV2(this, 'ConfigTable', {
      tableName: `teamclaw-config-${deployEnv}`,
      partitionKey: { name: 'scopeKey', type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'configKey', type: aws_dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.RETAIN,
      billing: aws_dynamodb.Billing.onDemand(),
    });

    // ─── DynamoDB SSM Parameters ───
    new aws_ssm.StringParameter(this, 'UsersTableArnParam', {
      parameterName: ssm.DYNAMODB.USERS_TABLE_ARN,
      stringValue: userTable.tableArn,
    });
    new aws_ssm.StringParameter(this, 'UsersTableNameParam', {
      parameterName: ssm.DYNAMODB.USERS_TABLE_NAME,
      stringValue: userTable.tableName,
    });
    new aws_ssm.StringParameter(this, 'UsageTableArnParam', {
      parameterName: ssm.DYNAMODB.USAGE_TABLE_ARN,
      stringValue: usageTable.tableArn,
    });
    new aws_ssm.StringParameter(this, 'UsageTableNameParam', {
      parameterName: ssm.DYNAMODB.USAGE_TABLE_NAME,
      stringValue: usageTable.tableName,
    });
    new aws_ssm.StringParameter(this, 'TeamsTableArnParam', {
      parameterName: ssm.DYNAMODB.TEAMS_TABLE_ARN,
      stringValue: teamsTable.tableArn,
    });
    new aws_ssm.StringParameter(this, 'TeamsTableNameParam', {
      parameterName: ssm.DYNAMODB.TEAMS_TABLE_NAME,
      stringValue: teamsTable.tableName,
    });
    new aws_ssm.StringParameter(this, 'ConfigTableArnParam', {
      parameterName: ssm.DYNAMODB.CONFIG_TABLE_ARN,
      stringValue: configTable.tableArn,
    });
    new aws_ssm.StringParameter(this, 'ConfigTableNameParam', {
      parameterName: ssm.DYNAMODB.CONFIG_TABLE_NAME,
      stringValue: configTable.tableName,
    });

    // ─── Key Pool Proxy Lambda ───
    const apiKeysSecretArn = aws_ssm.StringParameter.valueForStringParameter(
      this, ssm.SECRETS.API_KEYS_SECRET_ARN,
    );
    const apiKeysSecret = aws_secretsmanager.Secret.fromSecretCompleteArn(
      this, 'ApiKeysSecret', apiKeysSecretArn,
    );

    const keyPoolLambda = new aws_lambda_nodejs.NodejsFunction(this, 'KeyPoolProxyLambda', {
      ...TC_LAMBDA_DEFAULT_PROPS,
      functionName: `teamclaw-key-pool-proxy-${deployEnv}`,
      entry: `${LAMBDA_ENTRY_PATH}/key-pool-proxy/index.ts`,
      environment: {
        API_KEYS_SECRET_ARN: apiKeysSecretArn,
        USAGE_TABLE_NAME: usageTable.tableName,
      },
    });
    apiKeysSecret.grantRead(keyPoolLambda);
    usageTable.grantWriteData(keyPoolLambda);

    // API Gateway fronting the Key Pool Proxy
    const api = new aws_apigateway.RestApi(this, 'KeyPoolApi', {
      restApiName: `teamclaw-key-pool-${deployEnv}`,
      description: 'Proxies AI provider API calls, injects keys server-side',
    });

    api.root.addProxy({
      defaultIntegration: new aws_apigateway.LambdaIntegration(keyPoolLambda),
      anyMethod: true,
      defaultMethodOptions: {
        authorizationType: aws_apigateway.AuthorizationType.IAM,
      },
    });

    new aws_ssm.StringParameter(this, 'KeyPoolProxyUrlParam', {
      parameterName: ssm.API_GATEWAY.KEY_POOL_PROXY_URL,
      stringValue: api.url,
    });

    // ─── Lifecycle Lambda (start/stop/provision/cron-sync) ───
    const lifecycleLambda = new aws_lambda_nodejs.NodejsFunction(this, 'LifecycleLambda', {
      ...TC_LIFECYCLE_LAMBDA_PROPS,
      functionName: `teamclaw-lifecycle-${deployEnv}`,
      entry: `${LAMBDA_ENTRY_PATH}/lifecycle/index.ts`,
      environment: {
        DEPLOY_ENV: deployEnv,
        USER_TABLE_NAME: userTable.tableName,
        ECS_CLUSTER_NAME: aws_ssm.StringParameter.valueForStringParameter(this, ssm.ECS.CLUSTER_NAME),
        EFS_FILE_SYSTEM_ID: aws_ssm.StringParameter.valueForStringParameter(this, ssm.EFS.FILE_SYSTEM_ID),
        PRIVATE_SUBNET_IDS: aws_ssm.StringParameter.valueForStringParameter(this, ssm.VPC.PRIVATE_SUBNET_IDS),
        SECURITY_GROUP_ID: aws_ssm.StringParameter.valueForStringParameter(this, ssm.ECS.ALB_SECURITY_GROUP_ID),
        KEY_POOL_PROXY_URL: api.url,
      },
    });
    userTable.grantReadWriteData(lifecycleLambda);

    // ─── EventBridge Scheduler Role (for cron-aware wakeup) ───
    // This role allows EventBridge Scheduler to invoke the Lifecycle Lambda
    const schedulerRole = new aws_iam.Role(this, 'CronSchedulerRole', {
      roleName: `teamclaw-cron-scheduler-${deployEnv}`,
      assumedBy: new aws_iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    // Construct ARN manually to avoid circular dependency (Lambda referencing itself)
    const lifecycleLambdaArn = `arn:aws:lambda:${this.region}:${this.account}:function:teamclaw-lifecycle-${deployEnv}`;

    schedulerRole.addToPolicy(new aws_iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [lifecycleLambdaArn],
    }));

    new aws_ssm.StringParameter(this, id + 'LifecycleLambdaNameParam', {
      parameterName: `/tc/${deployEnv}/lifecycle-lambda-name`,
      stringValue: lifecycleLambda.functionName,
    });
    lifecycleLambda.addEnvironment('LIFECYCLE_LAMBDA_ARN', lifecycleLambdaArn);
    lifecycleLambda.addEnvironment('SCHEDULER_ROLE_ARN', schedulerRole.roleArn);

    // ECS permissions for lifecycle Lambda
    const ecsClusterArn = Stack.of(this).formatArn({
      service: 'ecs',
      resource: 'cluster',
      resourceName: `teamclaw-*-${deployEnv}`,
    });
    lifecycleLambda.addToRolePolicy(new aws_iam.PolicyStatement({
      actions: [
        'ecs:RunTask',
        'ecs:StopTask',
        'ecs:DescribeTasks',
        'ecs:ListTasks',
      ],
      resources: [
        ecsClusterArn,
        // Task ARNs in the same cluster
        Stack.of(this).formatArn({ service: 'ecs', resource: 'task', resourceName: `teamclaw-*-${deployEnv}/*` }),
      ],
    }));
    // RegisterTaskDefinition / DeregisterTaskDefinition only support '*' as resource
    lifecycleLambda.addToRolePolicy(new aws_iam.PolicyStatement({
      actions: [
        'ecs:RegisterTaskDefinition',
        'ecs:DeregisterTaskDefinition',
      ],
      resources: ['*'],
    }));
    lifecycleLambda.addToRolePolicy(new aws_iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [
        `arn:aws:iam::${this.account}:role/teamclaw-*-${deployEnv}*`,
      ],
      conditions: {
        StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' },
      },
    }));
    // EFS Access Point creation — scoped to the provisioned file system
    const efsFileSystemArn = Stack.of(this).formatArn({
      service: 'elasticfilesystem',
      resource: 'file-system',
      resourceName: aws_ssm.StringParameter.valueForStringParameter(this, ssm.EFS.FILE_SYSTEM_ID),
    });
    lifecycleLambda.addToRolePolicy(new aws_iam.PolicyStatement({
      actions: [
        'elasticfilesystem:CreateAccessPoint',
        'elasticfilesystem:DeleteAccessPoint',
        'elasticfilesystem:DescribeAccessPoints',
      ],
      resources: [
        efsFileSystemArn,
        // Access point ARNs under this file system
        Stack.of(this).formatArn({
          service: 'elasticfilesystem',
          resource: 'access-point',
          resourceName: '*',
        }),
      ],
    }));

    // EventBridge Scheduler permissions for cron-aware wakeup
    // Lifecycle Lambda manages EventBridge rules to pre-wake containers
    // before OpenClaw's internal CronJobs need to fire
    lifecycleLambda.addToRolePolicy(new aws_iam.PolicyStatement({
      actions: [
        'scheduler:CreateSchedule',
        'scheduler:UpdateSchedule',
        'scheduler:DeleteSchedule',
        'scheduler:GetSchedule',
        'scheduler:ListSchedules',
      ],
      resources: [
        `arn:aws:scheduler:*:*:schedule/teamclaw-cron-${deployEnv}/*`,
      ],
    }));
    lifecycleLambda.addToRolePolicy(new aws_iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [schedulerRole.roleArn],
      conditions: {
        StringEquals: { 'iam:PassedToService': 'scheduler.amazonaws.com' },
      },
    }));
  }
}
