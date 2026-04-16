---
name: jira
description: Create, search, and manage Jira issues and sprints via the Atlassian REST API
homepage: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
metadata: { "openclaw": { "emoji": "🔶", "requires": { "env": ["JIRA_TOKEN", "JIRA_BASEURL"] }, "primaryEnv": "JIRA_TOKEN" } }
---

# Jira

Interact with Jira Cloud to create, search, update, and transition issues, manage sprints, and add comments using the Atlassian REST API v3.

## Authentication

All requests use HTTP Basic Auth. Encode `$JIRA_EMAIL:$JIRA_TOKEN` as the credential pair. The base URL points to your Jira Cloud instance (e.g. `https://yourteam.atlassian.net`).

Common headers for every request:

```
-u "$JIRA_EMAIL:$JIRA_TOKEN" \
-H "Content-Type: application/json" \
-H "Accept: application/json"
```

## Common Operations

### Search Issues (JQL)

Use JQL to find issues. The `fields` parameter limits response size.

```bash
curl -s -X GET \
  "$JIRA_BASEURL/rest/api/3/search?jql=project%3DENG%20AND%20status%3D%22In%20Progress%22&maxResults=20&fields=key,summary,status,assignee,priority" \
  -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -H "Accept: application/json"
```

Key response fields: `issues[].key`, `issues[].fields.summary`, `issues[].fields.status.name`, `issues[].fields.assignee.displayName`, `total`.

Useful JQL examples:
- `assignee = currentUser() AND resolution = Unresolved`
- `project = ENG AND sprint in openSprints()`
- `labels = bug AND priority = High AND updated >= -7d`
- `text ~ "search term"`

### Get Issue by Key

```bash
curl -s -X GET \
  "$JIRA_BASEURL/rest/api/3/issue/ENG-123?fields=summary,description,status,assignee,priority,labels,comment" \
  -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -H "Accept: application/json"
```

Key response fields: `fields.summary`, `fields.description.content` (ADF format), `fields.status.name`, `fields.priority.name`, `fields.comment.comments[]`.

### Create Issue

```bash
curl -s -X POST \
  "$JIRA_BASEURL/rest/api/3/issue" \
  -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "fields": {
      "project": { "key": "ENG" },
      "summary": "Implement user authentication flow",
      "description": {
        "type": "doc",
        "version": 1,
        "content": [
          {
            "type": "paragraph",
            "content": [{ "type": "text", "text": "Description here" }]
          }
        ]
      },
      "issuetype": { "name": "Task" },
      "priority": { "name": "Medium" },
      "labels": ["backend"]
    }
  }'
```

Response: `key` (e.g. "ENG-456"), `id`, `self`.

Issue types: `Bug`, `Task`, `Story`, `Epic`, `Sub-task`. Priorities: `Highest`, `High`, `Medium`, `Low`, `Lowest`.

### Update Issue

```bash
curl -s -X PUT \
  "$JIRA_BASEURL/rest/api/3/issue/ENG-123" \
  -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "summary": "Updated summary",
      "labels": ["backend", "urgent"],
      "priority": { "name": "High" }
    }
  }'
```

Returns 204 No Content on success.

### Transition Issue (Change Status)

First, get available transitions:

```bash
curl -s -X GET \
  "$JIRA_BASEURL/rest/api/3/issue/ENG-123/transitions" \
  -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -H "Accept: application/json"
```

Then apply a transition by ID:

```bash
curl -s -X POST \
  "$JIRA_BASEURL/rest/api/3/issue/ENG-123/transitions" \
  -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "transition": { "id": "31" } }'
```

Common transition names: `To Do`, `In Progress`, `In Review`, `Done`. Always fetch transitions first since IDs vary per project workflow.

### Assign Issue

```bash
curl -s -X PUT \
  "$JIRA_BASEURL/rest/api/3/issue/ENG-123/assignee" \
  -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "accountId": "5b10ac8d82e05b22cc7d4ef5" }'
```

To find a user's accountId, search users:

```bash
curl -s -X GET \
  "$JIRA_BASEURL/rest/api/3/user/search?query=jane@example.com" \
  -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -H "Accept: application/json"
```

### Add Comment

```bash
curl -s -X POST \
  "$JIRA_BASEURL/rest/api/3/issue/ENG-123/comment" \
  -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "body": {
      "type": "doc",
      "version": 1,
      "content": [
        {
          "type": "paragraph",
          "content": [{ "type": "text", "text": "Deployed to staging. Ready for QA." }]
        }
      ]
    }
  }'
```

### Get Board Sprints

```bash
curl -s -X GET \
  "$JIRA_BASEURL/rest/agile/1.0/board/1/sprint?state=active,future&maxResults=10" \
  -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -H "Accept: application/json"
```

Key response fields: `values[].id`, `values[].name`, `values[].state`, `values[].startDate`, `values[].endDate`.

### Get Sprint Issues

```bash
curl -s -X GET \
  "$JIRA_BASEURL/rest/agile/1.0/sprint/42/issue?fields=key,summary,status,assignee,priority&maxResults=50" \
  -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  -H "Accept: application/json"
```

## Tips

- **Description format**: Jira API v3 uses Atlassian Document Format (ADF), not plain text. Wrap text in `doc > paragraph > text` nodes as shown above.
- **Pagination**: Use `startAt` and `maxResults` query params. Check `total` in response.
- **Rate limits**: Jira Cloud allows ~100 requests per 10 seconds. Batch reads with JQL rather than fetching individually.
- **Agile endpoints**: Sprint and board operations use `/rest/agile/1.0/` not `/rest/api/3/`.
- **Field discovery**: To find custom field IDs, use `GET /rest/api/3/field` and search by name.
- **Bulk operations**: For moving multiple issues to a sprint, use `POST /rest/agile/1.0/sprint/{sprintId}/issue` with a body of `{"issues": ["ENG-1", "ENG-2"]}`.
