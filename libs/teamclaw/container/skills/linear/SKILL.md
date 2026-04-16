---
name: linear
description: Create, search, and manage Linear issues, projects, and cycles via the GraphQL API
homepage: https://developers.linear.app/docs/graphql/working-with-the-graphql-api
metadata: { "openclaw": { "emoji": "🟣", "requires": { "env": ["LINEAR_TOKEN"] }, "primaryEnv": "LINEAR_TOKEN" } }
---

# Linear

Create, search, and manage Linear issues, projects, and cycles using the Linear GraphQL API.

## Authentication

All requests use a Bearer token. The single API endpoint is `https://api.linear.app/graphql`.

Common headers for every request:

```
-H "Authorization: $LINEAR_TOKEN" \
-H "Content-Type: application/json"
```

## Common Operations

### List Issues (Assigned to Me)

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { viewer { assignedIssues(first: 20, orderBy: updatedAt) { nodes { id identifier title state { name } priority priorityLabel assignee { name } project { name } cycle { name number } updatedAt } } } }"
  }'
```

Key response path: `data.viewer.assignedIssues.nodes[]`. Each issue has `identifier` (e.g. "ENG-123"), `title`, `state.name`, `priorityLabel`.

### Search Issues

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($filter: IssueFilter) { issues(filter: $filter, first: 20) { nodes { id identifier title state { name } priority priorityLabel assignee { name } labels { nodes { name } } } } }",
    "variables": {
      "filter": {
        "state": { "name": { "in": ["In Progress", "Todo"] } },
        "team": { "key": { "eq": "ENG" } }
      }
    }
  }'
```

Useful filter fields: `state.name`, `assignee.email`, `priority` (1=Urgent, 2=High, 3=Medium, 4=Low, 0=None), `label.name`, `project.name`, `cycle.number`.

### Get Issue by Identifier

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($id: String!) { issue(id: $id) { id identifier title description state { id name } priority priorityLabel assignee { id name email } team { id key name } project { id name } cycle { id name number } labels { nodes { id name } } comments { nodes { body user { name } createdAt } } createdAt updatedAt } }",
    "variables": { "id": "ENG-123" }
  }'
```

Note: The `id` variable accepts both the UUID and the human-readable identifier (e.g. "ENG-123").

### Create Issue

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title url } } }",
    "variables": {
      "input": {
        "teamId": "TEAM_UUID",
        "title": "Implement SSO login flow",
        "description": "Add SAML-based SSO integration for enterprise customers.\n\n## Acceptance Criteria\n- Support SAML 2.0\n- Auto-provision users on first login",
        "priority": 2,
        "stateId": "STATE_UUID",
        "labelIds": ["LABEL_UUID"]
      }
    }
  }'
```

Response: `data.issueCreate.issue.identifier`, `data.issueCreate.issue.url`.

Priority values: 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low. Description supports Markdown.

### Update Issue Status

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier state { name } } } }",
    "variables": {
      "id": "ISSUE_UUID_OR_IDENTIFIER",
      "input": { "stateId": "STATE_UUID" }
    }
  }'
```

To find valid state IDs, query workflow states for a team (see below).

### Assign Issue

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier assignee { name } } } }",
    "variables": {
      "id": "ENG-123",
      "input": { "assigneeId": "USER_UUID" }
    }
  }'
```

### Add Comment

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id body } } }",
    "variables": {
      "input": {
        "issueId": "ISSUE_UUID",
        "body": "Deployed to staging. Smoke tests passing. Ready for review."
      }
    }
  }'
```

Comment body supports Markdown.

### List Teams

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { teams { nodes { id key name states { nodes { id name type } } } } }"
  }'
```

Key response: `data.teams.nodes[]` with `key` (e.g. "ENG"), `name`, and `states.nodes[]` containing workflow states with `type` (backlog, unstarted, started, completed, cancelled).

### List Projects

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { projects(first: 20, orderBy: updatedAt) { nodes { id name state progress teams { nodes { key } } targetDate } } }"
  }'
```

### List Active Cycles

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($teamId: String!) { team(id: $teamId) { activeCycle { id name number startsAt endsAt progress { completedScopeCount totalScopeCount } issues { nodes { identifier title state { name } assignee { name } } } } } }",
    "variables": { "teamId": "TEAM_UUID" }
  }'
```

## Key Types

| Type | Description | Key Fields |
|------|-------------|------------|
| Issue | Work item | `identifier`, `title`, `state`, `priority`, `assignee` |
| Team | Group of members | `key`, `name`, `states` (workflow states) |
| Project | Collection of issues | `name`, `state`, `progress`, `targetDate` |
| Cycle | Time-boxed sprint | `number`, `startsAt`, `endsAt`, `progress` |
| WorkflowState | Issue status | `name`, `type` (backlog/unstarted/started/completed/cancelled) |
| Label | Tag for issues | `name`, `color` |
| User | Team member | `name`, `email`, `displayName` |

## Tips

- **GraphQL only**: Linear has no REST API. All operations go through `POST https://api.linear.app/graphql`.
- **Identifiers vs UUIDs**: Most mutations accept either the human-readable identifier ("ENG-123") or the UUID. Query the issue first if you only have one format.
- **Pagination**: Use `first`/`after` cursor-based pagination. Check `pageInfo.hasNextPage` and `pageInfo.endCursor`.
- **Workflow states**: State IDs differ per team. Always fetch team states before transitioning issues.
- **Rate limits**: Linear allows 1500 requests per hour per token. Complex queries cost more against the rate limit.
- **Batch operations**: Use GraphQL aliases to run multiple mutations in one request, e.g. `a: issueUpdate(...) { ... } b: issueUpdate(...) { ... }`.
- **Markdown**: Issue descriptions and comments support full Markdown including code blocks, links, and checklists.
- **Filtering**: The `IssueFilter` input type supports nested boolean logic with `and`, `or` fields for complex queries.
