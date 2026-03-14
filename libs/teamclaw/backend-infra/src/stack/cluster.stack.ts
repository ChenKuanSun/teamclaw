import {
  Stack,
  Duration,
  aws_ec2,
  aws_ecs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_cloudfront,
  aws_cloudfront_origins,
  aws_ssm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackPropsWithEnv, TC_SSM_PARAMETER } from '@TeamClaw/core/cloud-config';
import { TC_FARGATE_DEFAULTS } from '@TeamClaw/teamclaw/cloud-config';

export class ClusterStack extends Stack {
  constructor(scope: Construct, id: string, props: StackPropsWithEnv) {
    super(scope, id, props);
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
    const albSecurityGroup = new aws_ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      description: 'ALB security group',
      allowAllOutbound: true,
    });
    albSecurityGroup.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.tcp(443), 'HTTPS');
    albSecurityGroup.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.tcp(80), 'HTTP');

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
    });

    // Target group for user containers (IP-based for Fargate)
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'ContainerTargetGroup', {
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
    });

    const listener = alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([targetGroup]),
    });

    // CloudFront → ALB (provides HTTPS/WSS without custom domain)
    const distribution = new aws_cloudfront.Distribution(this, 'GatewayDistribution', {
      comment: `TeamClaw WebSocket Gateway (${deployEnv})`,
      defaultBehavior: {
        origin: new aws_cloudfront_origins.HttpOrigin(alb.loadBalancerDnsName, {
          protocolPolicy: aws_cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          httpPort: 80,
        }),
        viewerProtocolPolicy: aws_cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: aws_cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: aws_cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: aws_cloudfront.OriginRequestPolicy.ALL_VIEWER,
      },
      httpVersion: aws_cloudfront.HttpVersion.HTTP2_AND_3,
    });

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
  }
}
