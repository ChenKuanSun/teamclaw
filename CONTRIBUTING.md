# Contributing to TeamClaw

Thank you for your interest in contributing to TeamClaw. This guide covers the
development setup, conventions, and process for submitting changes.

## Development Setup

### Prerequisites

- Node.js 22+
- Yarn 1.22+
- AWS CLI v2
- AWS CDK CLI
- Docker

### Getting Started

```bash
git clone https://github.com/your-org/teamclaw.git
cd teamclaw
yarn install
```

### Running Tests

```bash
# All tests
yarn test

# Single project
nx test web-chat
nx test teamclaw-backend-infra
```

### Linting

```bash
yarn lint
```

## Branch Strategy

- **main** -- production-ready code
- **feature/\*** -- new features branch off `main`
- **fix/\*** -- bug fixes branch off `main`

Always create a feature or fix branch from `main`. Do not commit directly to
`main`.

```bash
git checkout main
git pull
git checkout -b feature/my-feature
```

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

**Types:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`

**Scopes:** `chat`, `admin`, `foundation`, `cluster`, `control-plane`,
`backend-infra`, `container`, `core`

Examples:

```
feat(chat): add message search functionality
fix(backend-infra): handle missing API key gracefully
chore(core): update CDK dependency to 2.232
```

## Pull Request Process

1. Create a feature branch and make your changes.
2. Ensure all tests pass: `yarn test`
3. Ensure linting passes: `yarn lint`
4. Push your branch and open a pull request against `main`.
5. Fill in the PR template with a clear description of the change.
6. Request a review from at least one maintainer.
7. Address review feedback promptly.
8. Once approved, the PR will be squash-merged into `main`.

## Testing Requirements

- All existing tests must pass before a PR can be merged.
- New features and bug fixes must include corresponding tests.
- Unit tests live alongside source files with a `.spec.ts` suffix.
- Use Jest for all test suites.

## Code Style

- **ESLint** and **Prettier** are configured at the repo root.
- Run `yarn lint` to check for violations.
- Prettier formatting is enforced -- configure your editor to format on save.
- Import ordering is managed by `prettier-plugin-organize-imports`.

## Project Structure

Familiarize yourself with the monorepo layout before contributing:

- `apps/` -- deployable applications (CDK stacks and Angular frontends)
- `libs/core/` -- shared constants, types, and CDK helpers
- `libs/teamclaw/` -- TeamClaw-specific backend logic, cloud config, and
  container assets

Use Nx to understand project dependencies:

```bash
nx graph
```

## Pull Request Checklist

Before submitting your PR, verify:

- [ ] Code compiles without errors (`nx run-many -t build`)
- [ ] All existing tests pass (`nx run-many -t test`)
- [ ] New tests are added for new functionality
- [ ] Lint passes (`nx run-many -t lint`)
- [ ] Commit messages follow Conventional Commits format
- [ ] PR description explains what and why
- [ ] No secrets, API keys, or production URLs in committed files
- [ ] CDK stacks synthesize without errors (if infra changed)

## Adding a New Skill

1. Create a directory under `libs/teamclaw/container/skills/<skill-name>/`.
2. Add a `SKILL.md` file with YAML frontmatter:
   ```yaml
   ---
   name: skill-name
   description: One-line hint for the AI model
   homepage: https://api-docs-url
   metadata: { "openclaw": { "emoji": "...", "requires": { "env": ["ENV_VAR"] }, "primaryEnv": "ENV_VAR" } }
   ---
   ```
3. Write the skill prompt in the Markdown body (auth, common operations with
   cURL examples, tips).
4. Add the corresponding integration to `libs/teamclaw/backend-infra/src/lambda/admin/integrations/catalog-seed.ts`.
5. The skill is bundled into the container image via `COPY skills/ /skills/`
   in the Dockerfile.

## Adding a New Integration

1. Add the definition to `catalog-seed.ts` with `integrationId`, `displayName`,
   `credentialSchema`, and `envVarPrefix`.
2. Add the env var prefix to `INTEGRATION_PREFIXES` in
   `libs/teamclaw/container/scripts/generate-config.js`.
3. If upstream OpenClaw expects a specific config path (like
   `skills.entries.<name>.apiKey`), add the injection in `generate-config.js`.
4. If upstream expects a specific env var name different from ours, add an
   alias in the env file writer section of `generate-config.js`.
5. Update tests in `generate-config.spec.js` and add a skill SKILL.md if
   applicable.

## Adding a New CDK Stack

1. Create the stack class in `libs/teamclaw/backend-infra/src/stack/`.
2. Create the app entry point in `apps/infra-<name>/src/main.ts`.
3. Add tests in `libs/teamclaw/backend-infra/src/stack/__tests__/`.
4. Document the deploy order in `README.md` if it has dependencies.
5. Add the stack to `.github/workflows/cdk-deploy.yml`.

## Questions?

Open an issue for discussion before starting large changes. This helps avoid
duplicate work and ensures alignment with the project direction.

For security vulnerabilities, see [SECURITY.md](SECURITY.md).
