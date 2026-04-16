import {
  StackPropsWithEnv,
  TC_SSM_PARAMETER,
  getTCApiKeysReadPolicy,
} from '@TeamClaw/core/cloud-config';
import { TC_FARGATE_DEFAULTS } from '@TeamClaw/teamclaw/cloud-config';
import {
  Duration,
  RemovalPolicy,
  Stack,
  aws_cloudfront,
  aws_cloudfront_origins,
  aws_ec2,
  aws_ecs,
  aws_iam,
  aws_logs,
  aws_ssm,
  aws_elasticloadbalancingv2 as elbv2,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class ClusterStack extends Stack {
  // Security baseline:
  // - Fargate runtime (managed kernel, default seccomp/capability drops)
  // - initProcessEnabled: true (proper signal handling, zombie reaping)
  // - Sidecar: readonlyRootFilesystem (stateless proxy — no write surface)
  // - EFS: IAM auth + transit encryption
  // - ALB: internet-facing, but origin-only via CloudFront (no direct)
  constructor(scope: Construct, id: string, props: StackPropsWithEnv) {
    super(scope, id, {
      ...props,
      description:
        'TeamClaw Cluster: ECS, ALB, CloudFront, Task Definition, IAM Roles',
    });
    const { deployEnv } = props;
    const ssm = TC_SSM_PARAMETER[deployEnv];

    // Import VPC from Foundation (lookup by name to avoid Token issues with fromLookup)
    const vpc = aws_ec2.Vpc.fromLookup(this, 'Vpc', {
      vpcName: `teamclaw-${deployEnv}`,
    });

    // ECS Cluster
    const cluster = new aws_ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: `teamclaw-${deployEnv}`,
      containerInsights: true,
    });

    new aws_ssm.StringParameter(this, 'ClusterArnParam', {
      parameterName: ssm.ECS.CLUSTER_ARN,
      stringValue: cluster.clusterArn,
    });
    new aws_ssm.StringParameter(this, 'ClusterNameParam', {
      parameterName: ssm.ECS.CLUSTER_NAME,
      stringValue: cluster.clusterName,
    });

    // ALB (public-facing, routes to per-user containers)
    const albSecurityGroup = new aws_ec2.SecurityGroup(
      this,
      'AlbSecurityGroup',
      {
        vpc,
        description: 'ALB security group',
        allowAllOutbound: true,
      },
    );
    albSecurityGroup.addIngressRule(
      aws_ec2.Peer.anyIpv4(),
      aws_ec2.Port.tcp(443),
      'HTTPS',
    );
    albSecurityGroup.addIngressRule(
      aws_ec2.Peer.anyIpv4(),
      aws_ec2.Port.tcp(80),
      'HTTP',
    );
    // Containers share this SG — allow ALB → container health check + traffic on container port
    albSecurityGroup.addIngressRule(
      albSecurityGroup,
      aws_ec2.Port.tcp(TC_FARGATE_DEFAULTS.port),
      'ALB to containers',
    );

    // Allow containers (using ALB SG) to mount EFS via NFS
    const efsSgId = aws_ssm.StringParameter.valueForStringParameter(
      this,
      ssm.EFS.SECURITY_GROUP_ID,
    );
    const efsSecurityGroup = aws_ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'ImportedEfsSg',
      efsSgId,
    );
    efsSecurityGroup.addIngressRule(
      albSecurityGroup,
      aws_ec2.Port.tcp(2049),
      'NFS from ECS containers',
    );

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });

    // Target group for user containers (IP-based for Fargate)
    const targetGroup = new elbv2.ApplicationTargetGroup(
      this,
      'ContainerTargetGroup',
      {
        vpc,
        port: TC_FARGATE_DEFAULTS.port,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.IP,
        healthCheck: {
          path: TC_FARGATE_DEFAULTS.healthCheckPath,
          port: String(TC_FARGATE_DEFAULTS.port),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
          interval: Duration.seconds(15),
          timeout: Duration.seconds(5),
        },
        deregistrationDelay: Duration.seconds(10),
        targetGroupName: `tc-containers-${deployEnv}`,
      },
    );

    const listener = alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([targetGroup]),
    });

    // CloudFront → ALB (provides HTTPS/WSS without custom domain)
    const distribution = new aws_cloudfront.Distribution(
      this,
      'GatewayDistribution',
      {
        comment: `TeamClaw WebSocket Gateway (${deployEnv})`,
        defaultBehavior: {
          origin: new aws_cloudfront_origins.HttpOrigin(
            alb.loadBalancerDnsName,
            {
              protocolPolicy: aws_cloudfront.OriginProtocolPolicy.HTTP_ONLY,
              httpPort: 80,
            },
          ),
          viewerProtocolPolicy: aws_cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: aws_cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: aws_cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: aws_cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
        httpVersion: aws_cloudfront.HttpVersion.HTTP2,
      },
    );

    new aws_ssm.StringParameter(this, 'AlbListenerArnParam', {
      parameterName: ssm.ECS.ALB_LISTENER_ARN,
      stringValue: listener.listenerArn,
    });
    new aws_ssm.StringParameter(this, 'AlbSecurityGroupIdParam', {
      parameterName: ssm.ECS.ALB_SECURITY_GROUP_ID,
      stringValue: albSecurityGroup.securityGroupId,
    });
    new aws_ssm.StringParameter(this, 'AlbDnsNameParam', {
      parameterName: ssm.ECS.ALB_DNS_NAME,
      stringValue: distribution.distributionDomainName,
    });
    new aws_ssm.StringParameter(this, 'AlbTargetGroupArnParam', {
      parameterName: ssm.ECS.ALB_TARGET_GROUP_ARN,
      stringValue: targetGroup.targetGroupArn,
    });

    // ─── IAM: Task Execution Role ───
    const executionRole = new aws_iam.Role(this, 'TaskExecutionRole', {
      roleName: `teamclaw-execution-role-${deployEnv}`,
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy',
        ),
      ],
    });

    // ─── IAM: Task Role ───
    const taskRole = new aws_iam.Role(this, 'TaskRole', {
      roleName: `teamclaw-task-role-${deployEnv}`,
      assumedBy: new aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Secrets Manager: read API keys (used by both containers at runtime)
    taskRole.addToPolicy(
      getTCApiKeysReadPolicy(deployEnv, this.region, this.account),
    );

    // DynamoDB: sidecar writes usage records
    const usageTableArn = `arn:aws:dynamodb:${this.region}:${this.account}:table/teamclaw-usage-${deployEnv}`;
    taskRole.addToPolicy(
      new aws_iam.PolicyStatement({
        actions: ['dynamodb:PutItem'],
        resources: [usageTableArn],
      }),
    );

    // EFS: allow container to mount and write to the file system
    // Use wildcard — efsFileSystemId is an SSM Token that cannot be interpolated into formatArn
    const efsFileSystemId = aws_ssm.StringParameter.valueForStringParameter(
      this,
      ssm.EFS.FILE_SYSTEM_ID,
    );
    taskRole.addToPolicy(
      new aws_iam.PolicyStatement({
        actions: [
          'elasticfilesystem:ClientMount',
          'elasticfilesystem:ClientWrite',
          'elasticfilesystem:ClientRootAccess',
        ],
        resources: [
          `arn:aws:elasticfilesystem:${this.region}:${this.account}:file-system/*`,
        ],
      }),
    );

    // ─── CloudWatch Log Groups ───
    const mainLogGroup = new aws_logs.LogGroup(this, 'TeamClawLogGroup', {
      logGroupName: `/ecs/teamclaw-user-${deployEnv}`,
      retention: aws_logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const sidecarLogGroup = new aws_logs.LogGroup(this, 'SidecarLogGroup', {
      logGroupName: `/ecs/teamclaw-sidecar-${deployEnv}`,
      retention: aws_logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ─── ECS Task Definition ───
    const teamclawImageUri = aws_ssm.StringParameter.valueForStringParameter(
      this,
      ssm.ECR.TEAMCLAW_REPO_URI,
    );
    const sidecarImageUri = aws_ssm.StringParameter.valueForStringParameter(
      this,
      ssm.ECR.SIDECAR_REPO_URI,
    );

    const taskDefinition = new aws_ecs.FargateTaskDefinition(
      this,
      'UserTaskDefinition',
      {
        family: `teamclaw-user-${deployEnv}`,
        cpu: TC_FARGATE_DEFAULTS.cpu,
        memoryLimitMiB: TC_FARGATE_DEFAULTS.memoryMiB,
        taskRole,
        executionRole,
      },
    );

    // EFS volume (mounts root with IAM auth — lifecycle Lambda creates per-user access points at runtime)
    taskDefinition.addVolume({
      name: 'efs-user-data',
      efsVolumeConfiguration: {
        fileSystemId: efsFileSystemId,
        transitEncryption: 'ENABLED',
        authorizationConfig: {
          iam: 'ENABLED',
        },
      },
    });

    // Writable ephemeral /tmp for sidecar (readonlyRootFilesystem blocks root writes,
    // but Node/AWS SDK may use os.tmpdir() under some conditions — belt-and-suspenders).
    taskDefinition.addVolume({ name: 'sidecar-tmp' });

    // Main container
    const mainContainer = taskDefinition.addContainer('teamclaw', {
      containerName: 'teamclaw',
      image: aws_ecs.ContainerImage.fromRegistry(`${teamclawImageUri}:latest`),
      essential: true,
      portMappings: [
        {
          containerPort: TC_FARGATE_DEFAULTS.port,
          protocol: aws_ecs.Protocol.TCP,
        },
      ],
      logging: aws_ecs.LogDrivers.awsLogs({
        streamPrefix: 'teamclaw',
        logGroup: mainLogGroup,
      }),
      linuxParameters: new aws_ecs.LinuxParameters(
        this,
        'MainContainerLinuxParams',
        {
          initProcessEnabled: true,
        },
      ),
      healthCheck: {
        command: [
          'CMD-SHELL',
          `wget -qO- http://localhost:${TC_FARGATE_DEFAULTS.port}${TC_FARGATE_DEFAULTS.healthCheckPath} || exit 1`,
        ],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(60),
      },
    });
    mainContainer.addMountPoints({
      containerPath: '/efs',
      sourceVolume: 'efs-user-data',
      readOnly: false,
    });

    // Sidecar proxy container
    const sidecarContainer = taskDefinition.addContainer('proxy-sidecar', {
      containerName: 'proxy-sidecar',
      image: aws_ecs.ContainerImage.fromRegistry(`${sidecarImageUri}:latest`),
      essential: true,
      portMappings: [{ containerPort: 3000, protocol: aws_ecs.Protocol.TCP }],
      logging: aws_ecs.LogDrivers.awsLogs({
        streamPrefix: 'sidecar',
        logGroup: sidecarLogGroup,
      }),
      linuxParameters: new aws_ecs.LinuxParameters(
        this,
        'SidecarContainerLinuxParams',
        {
          initProcessEnabled: true,
        },
      ),
      readonlyRootFilesystem: true,
      healthCheck: {
        command: [
          'CMD-SHELL',
          'wget -qO- http://localhost:3000/health || exit 1',
        ],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(30),
      },
    });
    sidecarContainer.addMountPoints({
      containerPath: '/tmp',
      sourceVolume: 'sidecar-tmp',
      readOnly: false,
    });

    // Sidecar must be healthy before main container starts
    mainContainer.addContainerDependencies({
      container: sidecarContainer,
      condition: aws_ecs.ContainerDependencyCondition.HEALTHY,
    });

    // ─── SSM: Publish task definition and role ARNs ───
    new aws_ssm.StringParameter(this, 'TaskDefinitionArnParam', {
      parameterName: ssm.ECS.TASK_DEFINITION_ARN,
      stringValue: taskDefinition.taskDefinitionArn,
    });
    new aws_ssm.StringParameter(this, 'TaskRoleArnParam', {
      parameterName: ssm.ECS.TASK_ROLE_ARN,
      stringValue: taskRole.roleArn,
    });
    new aws_ssm.StringParameter(this, 'ExecutionRoleArnParam', {
      parameterName: ssm.ECS.EXECUTION_ROLE_ARN,
      stringValue: executionRole.roleArn,
    });
  }
}
