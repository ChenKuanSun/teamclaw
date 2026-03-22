# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-03-21

### Added

- Integration management system with credential cascade (global, team, user)
- 6 built-in integrations: Notion, Slack, GitHub, Jira, Confluence, Linear
- Forgot password flow for web-chat
- CDK-managed ECS task definition with IAM roles
- GitHub Actions CI/CD workflows
- Husky pre-commit hooks with lint-staged
- Comprehensive test suite (87 spec files, 800+ tests)
- CDK snapshot tests for all stacks
- Sidecar proxy unit tests
- Root-level OSS files (README, LICENSE, CONTRIBUTING, SECURITY, CHANGELOG)

### Fixed

- Lifecycle Lambda race condition on provisioning
- ALB listener rule priority collision
- Container idle-stop with missing lastActiveAt
- WebSocket reconnection falls back to session init
- Chat history persistence across page refresh
- API keys frontend-backend contract alignment
- DynamoDB GSI permissions for integration Lambdas

### Security

- Credentials passed as secret ARN references (not plaintext env vars)
- allowUserOverride enforcement on both read and write paths
- Input validation on integration/team IDs (path injection prevention)
- Credential schema validation (reject unknown keys)
- TypeScript strict mode enabled

## [0.1.0] - 2026-03-18

### Added

- **Foundation Stack** -- VPC, EFS, ECR, and Secrets Manager infrastructure
- **Cluster Stack** -- ECS Fargate cluster with ALB and security groups
- **Control Plane Stack** -- Cognito user pool, DynamoDB tables, lifecycle
  Lambda, key pool proxy
- **Admin Stack** -- Admin API via API Gateway and Lambda
- **Enterprise Chat UI** -- Angular 21 chat application with Cognito
  authentication
- **Enterprise Admin UI** -- Angular 21 admin dashboard
- **Per-user containerized agents** -- isolated OpenClaw instances on ECS
  Fargate
- **Centralized API key management** -- shared provider key pool with admin
  controls
- **Auto-stop idle containers** -- 30-minute inactivity timeout for cost
  optimization
- **SOUL.md layering** -- system, team, and user configuration merge
- **CORS configuration** -- production Amplify domain allowlisting
