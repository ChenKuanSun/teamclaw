# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in TeamClaw, please report it responsibly.

**Email:** security@affiora.ai

**Do NOT** open a public GitHub issue for security vulnerabilities.

Include the following in your report:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Response Timeline

- **48 hours** -- We will acknowledge receipt of your report
- **7 days** -- We will provide a fix or mitigation plan for critical vulnerabilities
- **30 days** -- We will publish a security advisory if applicable

## Scope

The following are **in scope:**

- API key exposure through sidecar proxy, EFS, or container environment
- Credential leakage via container logs, config snapshots, or DynamoDB
- Cross-tenant data access through EFS or shared ALB
- Container escape or privilege escalation in ECS Fargate
- Prompt injection via SOUL.md, SKILL.md, or bootstrap files
- SSRF through the sidecar proxy or `allowPrivateNetwork` configuration
- Authentication bypass in Cognito or API Gateway
- CDK misconfigurations exposing infrastructure
- Beta header injection bypassing governance controls (`BETA_ALLOWLIST`)

The following are **out of scope:**

- Vulnerabilities in upstream OpenClaw (report to [openclaw/openclaw](https://github.com/openclaw/openclaw/security))
- Vulnerabilities in AWS managed services (report to [AWS](https://aws.amazon.com/security/vulnerability-reporting/))
- Social engineering or phishing attacks
- Denial of service attacks

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |

## Security Architecture

TeamClaw employs defense-in-depth:

### Container Isolation

- Each user runs in an isolated ECS Fargate task with its own filesystem namespace
- Containers have no inbound network access from other user containers
- `initProcessEnabled` for proper signal handling and zombie reaping
- Sidecar uses `readonlyRootFilesystem` with ephemeral `/tmp` only

### Credential Management

- Provider API keys stored in AWS Secrets Manager, never in application code
- Sidecar proxy injects credentials at the network layer -- OpenClaw process never sees real keys
- Round-robin key rotation across the enterprise key pool
- Integration credentials fetched at container boot, written to env file with `0600` permissions

### Governance Controls

- `BETA_ALLOWLIST` in sidecar prevents unauthorized Anthropic API feature activation
- Module-level self-check prevents governance drift between provider config and allowlist
- Context-window downgrade telemetry (`x-teamclaw-downgrade` header + DynamoDB logging)

### Authentication

- AWS Cognito with SRP-based password verification
- JWT-scoped sessions per user
- API Gateway authorizer for admin panel

### Encryption

- EFS volumes encrypted with AWS-managed keys, transit encryption enabled
- DynamoDB encryption at rest by default
- CloudFront HTTPS-only viewer policy with HSTS headers

### Dependencies

- Dependencies regularly reviewed for known vulnerabilities
- OpenClaw pinned to specific version (`ARG OPENCLAW_VERSION` in Dockerfile)
- Upstream security advisories monitored and applied promptly
