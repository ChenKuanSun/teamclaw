import { ENVIRONMENT } from './app';

export const TC_SECRET_MANAGER_ARN = {
  [ENVIRONMENT.PROD]: {
    GITHUB_OAUTH_TOKEN:
      'arn:aws:secretsmanager:ap-southeast-1:023371593417:secret:prod/CHD/github/oauth-Tf3qVq',
  },
  [ENVIRONMENT.DEV]: {
    GITHUB_OAUTH_TOKEN:
      'arn:aws:secretsmanager:ap-southeast-1:023371593417:secret:prod/CHD/github/oauth-Tf3qVq',
  },
};
