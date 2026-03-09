import {
  TC_SECRET_MANAGER_ARN,
  StackPropsWithEnv,
} from '@TeamClaw/core/cloud-config';
import * as aws_amplify from '@aws-cdk/aws-amplify-alpha';
import { SecretValue, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class AdminAmplifyStack extends Stack {
  public readonly app: aws_amplify.App;

  constructor(scope: Construct, id: string, props: StackPropsWithEnv) {
    super(scope, id, props);
    const { deployEnv } = props;

    const secretArn = TC_SECRET_MANAGER_ARN[deployEnv].GITHUB_OAUTH_TOKEN;

    this.app = new aws_amplify.App(this, 'TeamClawAdminApp', {
      sourceCodeProvider: new aws_amplify.GitHubSourceCodeProvider({
        owner: 'ChannelDAO',
        repository: 'teamclaw',
        oauthToken: SecretValue.secretsManager(secretArn),
      }),
      environmentVariables: {
        AMPLIFY_MONOREPO_APP_ROOT: 'apps/enterprise-admin',
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
