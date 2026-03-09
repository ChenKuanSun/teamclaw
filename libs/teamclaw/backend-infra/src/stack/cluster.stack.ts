import {
  Stack,
  aws_ec2,
  aws_ecs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_ssm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackPropsWithEnv, TC_SSM_PARAMETER } from '@TeamClaw/core/cloud-config';

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

    // TODO: Add ACM certificate for HTTPS
    // When a certificate is available, change this to port 443 HTTPS listener
    // and add HTTP -> HTTPS redirect on port 80
    const listener = alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not Found',
      }),
    });

    new aws_ssm.StringParameter(this, 'AlbListenerArnParam', {
      parameterName: ssm.ECS.ALB_LISTENER_ARN,
      stringValue: listener.listenerArn,
    });
    new aws_ssm.StringParameter(this, 'AlbSecurityGroupIdParam', {
      parameterName: ssm.ECS.ALB_SECURITY_GROUP_ID,
      stringValue: albSecurityGroup.securityGroupId,
    });
  }
}
