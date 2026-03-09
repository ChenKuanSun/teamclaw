import { spawn } from 'node:child_process';

process.env['TS_NODE_PROJECT'] = process.env['CDK_TSCONFIG'] || './tsconfig.json';

spawn('node', ['--require', 'ts-node/register', 'cdk/main.ts'], {
  shell: true,
  stdio: 'inherit',
});
