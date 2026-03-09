import {
  Stack,
  aws_ec2,
  aws_efs,
  aws_ecr,
  aws_secretsmanager,
  aws_ssm,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackPropsWithEnv, TC_SSM_PARAMETER } from '@TeamClaw/core/cloud-config';

export class FoundationStack extends Stack {
  public readonly vpc: aws_ec2.IVpc;
  public readonly fileSystem: aws_efs.IFileSystem;
  public readonly ecrRepo: aws_ecr.IRepository;

  constructor(scope: Construct, id: string, props: StackPropsWithEnv) {
    super(scope, id, props);
    const { deployEnv } = props;
    const ssm = TC_SSM_PARAMETER[deployEnv];

    // VPC with private subnets (Fargate tasks) + public subnets (ALB)
    const vpc = new aws_ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      vpcName: `teamclaw-${deployEnv}`,
      subnetConfiguration: [
        { name: 'Public', subnetType: aws_ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Private', subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      ],
    });
    this.vpc = vpc;

    new aws_ssm.StringParameter(this, 'VpcIdParam', {
      parameterName: ssm.VPC.VPC_ID,
      stringValue: vpc.vpcId,
    });

    // EFS — encrypted, per-user Access Points created at runtime by Lifecycle Lambda
    const efsSecurityGroup = new aws_ec2.SecurityGroup(this, 'EfsSecurityGroup', {
      vpc,
      description: 'EFS mount target security group',
      allowAllOutbound: false,
    });

    const fileSystem = new aws_efs.FileSystem(this, 'FileSystem', {
      vpc,
      securityGroup: efsSecurityGroup,
      encrypted: true,
      performanceMode: aws_efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: aws_efs.ThroughputMode.ELASTIC,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecyclePolicy: aws_efs.LifecyclePolicy.AFTER_30_DAYS,
    });
    this.fileSystem = fileSystem;

    new aws_ssm.StringParameter(this, 'EfsFileSystemIdParam', {
      parameterName: ssm.EFS.FILE_SYSTEM_ID,
      stringValue: fileSystem.fileSystemId,
    });
    new aws_ssm.StringParameter(this, 'EfsFileSystemArnParam', {
      parameterName: ssm.EFS.FILE_SYSTEM_ARN,
      stringValue: fileSystem.fileSystemArn,
    });
    new aws_ssm.StringParameter(this, 'EfsSecurityGroupIdParam', {
      parameterName: ssm.EFS.SECURITY_GROUP_ID,
      stringValue: efsSecurityGroup.securityGroupId,
    });

    // ECR repository for hardened TeamClaw image
    const ecrRepo = new aws_ecr.Repository(this, 'TeamClawRepo', {
      repositoryName: `teamclaw-enterprise-${deployEnv}`,
      removalPolicy: RemovalPolicy.RETAIN,
      imageScanOnPush: true,
    });
    this.ecrRepo = ecrRepo;

    new aws_ssm.StringParameter(this, 'EcrRepoUriParam', {
      parameterName: ssm.ECR.TEAMCLAW_REPO_URI,
      stringValue: ecrRepo.repositoryUri,
    });

    // Secrets Manager — API keys pool
    const apiKeysSecret = new aws_secretsmanager.Secret(this, 'ApiKeysSecret', {
      secretName: `${deployEnv}/teamclaw/api-keys`,
      description: 'Shared API key pool for TeamClaw',
    });

    new aws_ssm.StringParameter(this, 'ApiKeysSecretArnParam', {
      parameterName: ssm.SECRETS.API_KEYS_SECRET_ARN,
      stringValue: apiKeysSecret.secretArn,
    });
  }
}
