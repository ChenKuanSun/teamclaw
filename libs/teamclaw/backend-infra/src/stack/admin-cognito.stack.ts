/**
 * Admin Cognito Stack
 *
 * Creates a separate Cognito User Pool for Admin Panel.
 * This prevents password conflicts with the main app's OAuth flow,
 * which resets passwords on each Google/Microsoft login.
 */

import {
  TC_SSM_PARAMETER,
  ENVIRONMENT,
  StackPropsWithEnv,
} from '@TeamClaw/core/cloud-config';
import {
  TC_ADMIN_AUTH_CALLBACK_URL,
  TC_ADMIN_AUTH_LOGOUT_URL,
  TC_ADMIN_USER_POOL_DOMAIN_PREFIX,
} from '@TeamClaw/teamclaw/cloud-config';
import {
  RemovalPolicy,
  Stack,
  aws_cognito,
  aws_ssm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class AdminCognitoStack extends Stack {
  public readonly adminUserPool: aws_cognito.IUserPool;
  public readonly adminUserPoolClient: aws_cognito.IUserPoolClient;

  constructor(scope: Construct, id: string, props: StackPropsWithEnv) {
    super(scope, id, props);
    const { deployEnv } = props;

    // ==========================================================
    // Admin User Pool (Separate from Main App)
    // ==========================================================
    this.adminUserPool = new aws_cognito.UserPool(
      this,
      id + 'AdminUserPool',
      {
        removalPolicy: RemovalPolicy.RETAIN,
        selfSignUpEnabled: false, // Admin accounts are created manually only
        signInAliases: { email: true },
        autoVerify: { email: true },
        passwordPolicy: {
          minLength: 12,
          requireUppercase: true,
          requireLowercase: true,
          requireDigits: true,
          requireSymbols: true,
        },
        accountRecovery: aws_cognito.AccountRecovery.EMAIL_ONLY,
      },
    );

    // Add Cognito domain for Admin User Pool
    this.adminUserPool.addDomain('default', {
      cognitoDomain: {
        domainPrefix: TC_ADMIN_USER_POOL_DOMAIN_PREFIX[deployEnv],
      },
      managedLoginVersion: aws_cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    // Admin App Client (web app with PKCE)
    const adminCallbackUrls = [
      TC_ADMIN_AUTH_CALLBACK_URL[deployEnv],
    ];
    const adminLogoutUrls = [TC_ADMIN_AUTH_LOGOUT_URL[deployEnv]];

    // Add localhost for development
    if (deployEnv === ENVIRONMENT.DEV) {
      adminCallbackUrls.push('http://localhost:4900/auth/callback');
      adminLogoutUrls.push('http://localhost:4900/auth/login');
    }

    this.adminUserPoolClient = this.adminUserPool.addClient(
      id + 'AdminClient',
      {
        generateSecret: false, // No secret needed for public web app with PKCE
        supportedIdentityProviders: [
          aws_cognito.UserPoolClientIdentityProvider.COGNITO,
        ],
        authFlows: {
          userSrp: true,
        },
        oAuth: {
          callbackUrls: adminCallbackUrls,
          logoutUrls: adminLogoutUrls,
          flows: {
            authorizationCodeGrant: true,
          },
          scopes: [
            aws_cognito.OAuthScope.OPENID,
            aws_cognito.OAuthScope.EMAIL,
            aws_cognito.OAuthScope.PROFILE,
          ],
        },
      },
    );

    // Enable Managed Login for Admin client
    new aws_cognito.CfnManagedLoginBranding(
      this,
      id + 'AdminManagedLoginBranding',
      {
        userPoolId: this.adminUserPool.userPoolId,
        clientId: this.adminUserPoolClient.userPoolClientId,
        useCognitoProvidedValues: true,
      },
    );

    // ==========================================================
    // Store in SSM Parameters
    // ==========================================================
    new aws_ssm.StringParameter(this, id + 'AdminUserPoolId', {
      parameterName:
        TC_SSM_PARAMETER[deployEnv].ADMIN_COGNITO.USER_POOL_ID,
      stringValue: this.adminUserPool.userPoolId,
    });

    new aws_ssm.StringParameter(this, id + 'AdminUserPoolClientId', {
      parameterName:
        TC_SSM_PARAMETER[deployEnv].ADMIN_COGNITO.USER_POOL_CLIENT_ID,
      stringValue: this.adminUserPoolClient.userPoolClientId,
    });

    new aws_ssm.StringParameter(this, id + 'AdminUserPoolDomain', {
      parameterName:
        TC_SSM_PARAMETER[deployEnv].ADMIN_COGNITO.USER_POOL_DOMAIN,
      stringValue: TC_ADMIN_USER_POOL_DOMAIN_PREFIX[deployEnv],
    });
  }
}
