import { ENVIRONMENT } from '@TeamClaw/core/cloud-config';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ClusterStack } from '../cluster.stack';

describe('ClusterStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App({
      context: {
        // Provide VPC lookup context so Vpc.fromLookup resolves a dummy VPC
        ['vpc-provider:account=123456789012:filter.vpc-name=teamclaw-dev:region=us-west-1:returnAsymmetricSubnets=true']:
          {
            vpcId: 'vpc-12345',
            vpcCidrBlock: '10.0.0.0/16',
            ownerAccountId: '123456789012',
            availabilityZones: ['us-west-1a', 'us-west-1b'],
            subnetGroups: [
              {
                name: 'Public',
                type: 'Public',
                subnets: [
                  {
                    subnetId: 'subnet-public-1',
                    cidr: '10.0.0.0/24',
                    availabilityZone: 'us-west-1a',
                    routeTableId: 'rtb-pub1',
                  },
                  {
                    subnetId: 'subnet-public-2',
                    cidr: '10.0.1.0/24',
                    availabilityZone: 'us-west-1b',
                    routeTableId: 'rtb-pub2',
                  },
                ],
              },
              {
                name: 'Private',
                type: 'Private',
                subnets: [
                  {
                    subnetId: 'subnet-private-1',
                    cidr: '10.0.2.0/24',
                    availabilityZone: 'us-west-1a',
                    routeTableId: 'rtb-priv1',
                  },
                  {
                    subnetId: 'subnet-private-2',
                    cidr: '10.0.3.0/24',
                    availabilityZone: 'us-west-1b',
                    routeTableId: 'rtb-priv2',
                  },
                ],
              },
            ],
          },
      },
    });
    const stack = new ClusterStack(app, 'TestCluster', {
      deployEnv: ENVIRONMENT.DEV,
      env: { account: '123456789012', region: 'us-west-1' },
    });
    template = Template.fromStack(stack);
  });

  // ─── ECS Cluster ───

  test('creates ECS cluster with container insights', () => {
    template.hasResourceProperties('AWS::ECS::Cluster', {
      ClusterName: 'teamclaw-dev',
      ClusterSettings: Match.arrayWith([
        { Name: 'containerInsights', Value: 'enabled' },
      ]),
    });
  });

  // ─── ALB ───

  test('creates internet-facing ALB', () => {
    template.hasResourceProperties(
      'AWS::ElasticLoadBalancingV2::LoadBalancer',
      {
        Scheme: 'internet-facing',
        Type: 'application',
      },
    );
  });

  test('creates HTTP listener on port 80', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 80,
      Protocol: 'HTTP',
    });
  });

  // ─── Target Group ───

  test('creates IP-based target group on port 18789', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      Port: 18789,
      Protocol: 'HTTP',
      TargetType: 'ip',
    });
  });

  test('target group has health check on /health', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckPath: '/health',
      HealthCheckPort: '18789',
    });
  });

  // ─── CloudFront ───

  test('creates CloudFront distribution', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Comment: 'TeamClaw WebSocket Gateway (dev)',
        HttpVersion: 'http2',
      }),
    });
  });

  test('CloudFront uses HTTPS only viewer protocol', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'https-only',
        }),
      }),
    });
  });

  // ─── IAM Roles ───

  test('creates task execution role assumed by ecs-tasks', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'teamclaw-execution-role-dev',
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: { Service: 'ecs-tasks.amazonaws.com' },
            Action: 'sts:AssumeRole',
          }),
        ]),
      },
    });
  });

  test('creates task role assumed by ecs-tasks', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'teamclaw-task-role-dev',
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: { Service: 'ecs-tasks.amazonaws.com' },
            Action: 'sts:AssumeRole',
          }),
        ]),
      },
    });
  });

  test('task role has EFS permissions', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['elasticfilesystem:ClientMount']),
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  test('task role has DynamoDB PutItem for usage table', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'dynamodb:PutItem',
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  // ─── Task Definition ───

  test('creates Fargate task definition with correct CPU and memory', () => {
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Family: 'teamclaw-user-dev',
      Cpu: '1024',
      Memory: '2048',
      NetworkMode: 'awsvpc',
      RequiresCompatibilities: ['FARGATE'],
    });
  });

  test('task definition has 2 container definitions', () => {
    const taskDefs = template.findResources('AWS::ECS::TaskDefinition');
    const taskDef = Object.values(taskDefs)[0] as any;
    const containers = taskDef.Properties.ContainerDefinitions;
    expect(containers.length).toBe(2);
  });

  test('task definition has teamclaw container', () => {
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'teamclaw',
          Essential: true,
          PortMappings: Match.arrayWith([
            Match.objectLike({ ContainerPort: 18789 }),
          ]),
        }),
      ]),
    });
  });

  test('task definition has proxy-sidecar container', () => {
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'proxy-sidecar',
          Essential: true,
          PortMappings: Match.arrayWith([
            Match.objectLike({ ContainerPort: 3000 }),
          ]),
        }),
      ]),
    });
  });

  test('teamclaw container depends on sidecar being healthy', () => {
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'teamclaw',
          DependsOn: Match.arrayWith([
            Match.objectLike({
              ContainerName: 'proxy-sidecar',
              Condition: 'HEALTHY',
            }),
          ]),
        }),
      ]),
    });
  });

  // ─── EFS Volume ───

  test('task definition has EFS volume with IAM auth and transit encryption', () => {
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Volumes: Match.arrayWith([
        Match.objectLike({
          Name: 'efs-user-data',
          EFSVolumeConfiguration: Match.objectLike({
            TransitEncryption: 'ENABLED',
            AuthorizationConfig: Match.objectLike({
              IAM: 'ENABLED',
            }),
          }),
        }),
      ]),
    });
  });

  test('teamclaw container mounts EFS at /efs', () => {
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'teamclaw',
          MountPoints: Match.arrayWith([
            Match.objectLike({
              ContainerPath: '/efs',
              SourceVolume: 'efs-user-data',
              ReadOnly: false,
            }),
          ]),
        }),
      ]),
    });
  });

  // ─── Log Groups ───

  test('creates main log group with 1-month retention', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/ecs/teamclaw-user-dev',
      RetentionInDays: 30,
    });
  });

  test('creates sidecar log group with 1-month retention', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/ecs/teamclaw-sidecar-dev',
      RetentionInDays: 30,
    });
  });

  test('log groups have RETAIN removal policy', () => {
    const logGroups = template.findResources('AWS::Logs::LogGroup');
    for (const key of Object.keys(logGroups)) {
      expect(logGroups[key]['DeletionPolicy']).toBe('Retain');
    }
  });

  // ─── SSM Parameters ───

  test('creates SSM parameter for cluster ARN', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/ecs/clusterArn',
    });
  });

  test('creates SSM parameter for cluster name', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/ecs/clusterName',
    });
  });

  test('creates SSM parameter for ALB listener ARN', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/ecs/albListenerArn',
    });
  });

  test('creates SSM parameter for ALB security group ID', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/ecs/albSecurityGroupId',
    });
  });

  test('creates SSM parameter for ALB DNS name', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/ecs/albDnsName',
    });
  });

  test('creates SSM parameter for ALB target group ARN', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/ecs/albTargetGroupArn',
    });
  });

  test('creates SSM parameter for task definition ARN', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/ecs/taskDefinitionArn',
    });
  });

  test('creates SSM parameter for task role ARN', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/ecs/taskRoleArn',
    });
  });

  test('creates SSM parameter for execution role ARN', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/ecs/executionRoleArn',
    });
  });

  // ─── Security Hardening ───

  test('teamclaw container has initProcessEnabled', () => {
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'teamclaw',
          LinuxParameters: Match.objectLike({
            InitProcessEnabled: true,
          }),
        }),
      ]),
    });
  });

  test('proxy-sidecar container has initProcessEnabled', () => {
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'proxy-sidecar',
          LinuxParameters: Match.objectLike({
            InitProcessEnabled: true,
          }),
        }),
      ]),
    });
  });

  test('proxy-sidecar container has readonlyRootFilesystem', () => {
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'proxy-sidecar',
          ReadonlyRootFilesystem: true,
        }),
      ]),
    });
  });

  test('teamclaw container does not have readonlyRootFilesystem', () => {
    const taskDefs = template.findResources('AWS::ECS::TaskDefinition');
    const taskDef = Object.values(taskDefs)[0] as any;
    const containers = taskDef.Properties.ContainerDefinitions;
    const main = containers.find((c: any) => c.Name === 'teamclaw');
    expect(main.ReadonlyRootFilesystem).toBeUndefined();
  });

  // ─── Snapshot ───

  test('matches snapshot', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });
});
