import {
  TC_ADMIN_APP_DOMAIN_NAME,
  ENVIRONMENT,
} from '@TeamClaw/core/cloud-config';

export const TC_ADMIN_USER_POOL_DOMAIN_PREFIX = {
  [ENVIRONMENT.PROD]: 'teamclaw-admin',
  [ENVIRONMENT.DEV]: 'teamclaw-admin-dev',
};

export const TC_ADMIN_AUTH_CALLBACK_URL = {
  [ENVIRONMENT.PROD]: `https://${TC_ADMIN_APP_DOMAIN_NAME[ENVIRONMENT.PROD]}/auth/callback`,
  [ENVIRONMENT.DEV]: `https://${TC_ADMIN_APP_DOMAIN_NAME[ENVIRONMENT.DEV]}/auth/callback`,
};

export const TC_ADMIN_AUTH_LOGOUT_URL = {
  [ENVIRONMENT.PROD]: `https://${TC_ADMIN_APP_DOMAIN_NAME[ENVIRONMENT.PROD]}/auth/login`,
  [ENVIRONMENT.DEV]: `https://${TC_ADMIN_APP_DOMAIN_NAME[ENVIRONMENT.DEV]}/auth/login`,
};
