import {
  StackPropsWithEnv,
  TC_SECRET_MANAGER_ARN,
} from '@TeamClaw/core/cloud-config';
import * as aws_amplify from '@aws-cdk/aws-amplify-alpha';
import { SecretValue, Stack, aws_iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface AmplifyStackProps extends StackPropsWithEnv {
  githubOwner?: string;
  githubRepo?: string;
}

export class AmplifyStack extends Stack {
  public readonly app: aws_amplify.App;

  constructor(scope: Construct, id: string, props: AmplifyStackProps) {
    super(scope, id, {
      ...props,
      description: 'TeamClaw: Amplify Hosting for Chat App',
    });
    const { deployEnv } = props;
    const githubOwner =
      props.githubOwner ??
      this.node.tryGetContext('githubOwner') ??
      'ChannelDAO';
    const githubRepo =
      props.githubRepo ?? this.node.tryGetContext('githubRepo') ?? 'teamclaw';

    const secretArn = TC_SECRET_MANAGER_ARN[deployEnv].GITHUB_OAUTH_TOKEN;

    const amplifyRole = new aws_iam.Role(this, 'TeamClawAppRole', {
      assumedBy: new aws_iam.ServicePrincipal('amplify.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess-Amplify'),
      ],
    });

    this.app = new aws_amplify.App(this, 'TeamClawApp', {
      sourceCodeProvider: new aws_amplify.GitHubSourceCodeProvider({
        owner: githubOwner,
        repository: githubRepo,
        oauthToken: SecretValue.secretsManager(secretArn),
      }),
      role: amplifyRole,
      environmentVariables: {
        AMPLIFY_MONOREPO_APP_ROOT: 'apps/web-chat',
        AMPLIFY_DIFF_DEPLOY: 'false',
      },
      autoBranchDeletion: true,
    });

    // SPA redirect (Angular routing)
    this.app.addCustomRule(
      aws_amplify.CustomRule.SINGLE_PAGE_APPLICATION_REDIRECT,
    );

    // Branches
    this.app.addBranch('main', {
      autoBuild: true,
    });

    this.app.addBranch('dev', {
      autoBuild: true,
    });
  }
}
