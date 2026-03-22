export const TC_FARGATE_DEFAULTS = {
  cpu: 1024,       // 1 vCPU
  memoryMiB: 2048, // 2 GB
  port: 18789,     // OpenClaw gateway default port
  idleTimeoutMinutes: 30,
  healthCheckPath: '/health',
  teamclawImageTag: '1.2.3',
};
