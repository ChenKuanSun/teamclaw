export interface UserConfig {
  userId: string;
  teamId?: string;
  email: string;
  displayName: string;
  status: 'active' | 'suspended' | 'terminated';
  efsAccessPointId?: string;
  taskArn?: string;
}

export interface TeamConfig {
  teamId: string;
  name: string;
  adminUserIds: string[];
}

export interface TeamClawConfig {
  gateway: {
    port: number;
    token: string;
  };
  agents: Record<string, {
    name: string;
    model: string;
    soulMd?: string;
  }>;
  models: {
    providers: Record<string, {
      baseUrl: string;
    }>;
  };
}
