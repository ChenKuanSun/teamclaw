import { ENVIRONMENT } from '@TeamClaw/core/cloud-config';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { FoundationStack } from '../foundation.stack';

describe('FoundationStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new FoundationStack(app, 'TestFoundation', {
      deployEnv: ENVIRONMENT.DEV,
    });
    template = Template.fromStack(stack);
  });

  // ─── VPC ───

  test('creates VPC with 2 AZs and 1 NAT Gateway', () => {
    template.hasResourceProperties('AWS::EC2::VPC', {
      Tags: Match.arrayWith([
        Match.objectLike({ Key: 'Name', Value: 'teamclaw-dev' }),
      ]),
    });
  });

  test('creates public subnets', () => {
    const subnets = template.findResources('AWS::EC2::Subnet', {
      Properties: {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'aws-cdk:subnet-name', Value: 'Public' }),
        ]),
      },
    });
    expect(Object.keys(subnets).length).toBe(2);
  });

  test('creates private subnets', () => {
    const subnets = template.findResources('AWS::EC2::Subnet', {
      Properties: {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'aws-cdk:subnet-name', Value: 'Private' }),
        ]),
      },
    });
    expect(Object.keys(subnets).length).toBe(2);
  });

  test('creates exactly 1 NAT Gateway', () => {
    const natGateways = template.findResources('AWS::EC2::NatGateway');
    expect(Object.keys(natGateways).length).toBe(1);
  });

  // ─── EFS ───

  test('creates encrypted EFS file system with elastic throughput', () => {
    template.hasResourceProperties('AWS::EFS::FileSystem', {
      Encrypted: true,
      PerformanceMode: 'generalPurpose',
      ThroughputMode: 'elastic',
    });
  });

  test('EFS has RETAIN removal policy', () => {
    const fileSystems = template.findResources('AWS::EFS::FileSystem');
    const fsKey = Object.keys(fileSystems)[0];
    expect(fileSystems[fsKey]['DeletionPolicy']).toBe('Retain');
  });

  test('creates EFS security group', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'EFS mount target security group',
    });
  });

  // ─── ECR ───

  test('creates teamclaw-enterprise-dev ECR repository', () => {
    template.hasResourceProperties('AWS::ECR::Repository', {
      RepositoryName: 'teamclaw-enterprise-dev',
      ImageScanningConfiguration: { ScanOnPush: true },
    });
  });

  test('creates teamclaw-sidecar-dev ECR repository', () => {
    template.hasResourceProperties('AWS::ECR::Repository', {
      RepositoryName: 'teamclaw-sidecar-dev',
      ImageScanningConfiguration: { ScanOnPush: true },
    });
  });

  test('ECR repositories have RETAIN removal policy', () => {
    const repos = template.findResources('AWS::ECR::Repository');
    for (const key of Object.keys(repos)) {
      expect(repos[key]['DeletionPolicy']).toBe('Retain');
    }
  });

  // ─── Secrets Manager ───

  test('creates API keys secret', () => {
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'dev/teamclaw/api-keys',
      Description: 'Shared API key pool for TeamClaw',
    });
  });

  // ─── SSM Parameters ───

  test('creates SSM parameter for VPC ID', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/vpc/vpcId',
    });
  });

  test('creates SSM parameter for private subnet IDs', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/vpc/privateSubnetIds',
    });
  });

  test('creates SSM parameter for public subnet IDs', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/vpc/publicSubnetIds',
    });
  });

  test('creates SSM parameter for EFS file system ID', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/efs/fileSystemId',
    });
  });

  test('creates SSM parameter for EFS file system ARN', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/efs/fileSystemArn',
    });
  });

  test('creates SSM parameter for EFS security group ID', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/efs/securityGroupId',
    });
  });

  test('creates SSM parameter for ECR teamclaw repo URI', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/ecr/teamclawRepoUri',
    });
  });

  test('creates SSM parameter for ECR sidecar repo URI', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/ecr/sidecarRepoUri',
    });
  });

  test('creates SSM parameter for API keys secret ARN', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/secrets/apiKeysSecretArn',
    });
  });

  // ─── Snapshot ───

  test('matches snapshot', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });
});
