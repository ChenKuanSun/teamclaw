---
name: confluence
description: Search, read, and create Confluence pages and spaces via the Atlassian REST API
homepage: https://developer.atlassian.com/cloud/confluence/rest/v2/
metadata: { "openclaw": { "emoji": "📄", "requires": { "env": ["CONFLUENCE_TOKEN", "CONFLUENCE_BASEURL"] }, "primaryEnv": "CONFLUENCE_TOKEN" } }
---

# Confluence

Search, read, create, and update Confluence Cloud pages and spaces using the Atlassian REST API v2.

## Authentication

All requests use HTTP Basic Auth with `$CONFLUENCE_EMAIL:$CONFLUENCE_TOKEN`. The base URL points to your Confluence Cloud instance (e.g. `https://yourteam.atlassian.net/wiki`).

Common headers for every request:

```
-u "$CONFLUENCE_EMAIL:$CONFLUENCE_TOKEN" \
-H "Content-Type: application/json" \
-H "Accept: application/json"
```

## Common Operations

### Search Content (CQL)

Use CQL (Confluence Query Language) to find pages and blog posts.

```bash
curl -s -X GET \
  "$CONFLUENCE_BASEURL/rest/api/content/search?cql=type%3Dpage%20AND%20text%7E%22deployment%20runbook%22&limit=10" \
  -u "$CONFLUENCE_EMAIL:$CONFLUENCE_TOKEN" \
  -H "Accept: application/json"
```

Key response fields: `results[].id`, `results[].title`, `results[].space.key`, `results[].status`, `results[]._links.webui`.

Useful CQL examples:
- `type = page AND space = "ENG" AND title ~ "architecture"`
- `type = page AND label = "runbook" AND lastModified >= "2026-01-01"`
- `creator = currentUser() AND type = page`
- `ancestor = 123456` (pages under a parent)

### Get Page by ID

```bash
curl -s -X GET \
  "$CONFLUENCE_BASEURL/api/v2/pages/123456?body-format=storage" \
  -u "$CONFLUENCE_EMAIL:$CONFLUENCE_TOKEN" \
  -H "Accept: application/json"
```

Key response fields: `id`, `title`, `spaceId`, `status`, `body.storage.value` (HTML storage format), `version.number`.

### Get Page Body (Storage Format)

The storage format is XHTML-based markup. Example content:

```html
<h1>Heading</h1>
<p>Paragraph text with <strong>bold</strong> and <em>italic</em>.</p>
<ac:structured-macro ac:name="code">
  <ac:parameter ac:name="language">python</ac:parameter>
  <ac:plain-text-body><![CDATA[print("hello")]]></ac:plain-text-body>
</ac:structured-macro>
```

Common macros: `ac:structured-macro` for code blocks, info panels, tables of contents. Use `<ac:link>` for internal links.

### Create Page

```bash
curl -s -X POST \
  "$CONFLUENCE_BASEURL/api/v2/pages" \
  -u "$CONFLUENCE_EMAIL:$CONFLUENCE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "spaceId": "65541",
    "status": "current",
    "title": "Q2 Deployment Runbook",
    "parentId": "98765",
    "body": {
      "representation": "storage",
      "value": "<h1>Deployment Steps</h1><p>Follow these steps to deploy the Q2 release.</p><ol><li>Run preflight checks</li><li>Deploy to staging</li><li>Run smoke tests</li><li>Deploy to production</li></ol>"
    }
  }'
```

Response: `id`, `title`, `version.number`, `_links.webui`.

### Update Page

Updating requires the current version number (increment by 1).

```bash
curl -s -X PUT \
  "$CONFLUENCE_BASEURL/api/v2/pages/123456" \
  -u "$CONFLUENCE_EMAIL:$CONFLUENCE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "123456",
    "status": "current",
    "title": "Q2 Deployment Runbook (Updated)",
    "body": {
      "representation": "storage",
      "value": "<h1>Deployment Steps</h1><p>Updated procedure for Q2.</p>"
    },
    "version": {
      "number": 3,
      "message": "Updated deployment steps"
    }
  }'
```

Always fetch the page first to get the current `version.number`, then increment it.

### List Spaces

```bash
curl -s -X GET \
  "$CONFLUENCE_BASEURL/api/v2/spaces?limit=25&sort=name" \
  -u "$CONFLUENCE_EMAIL:$CONFLUENCE_TOKEN" \
  -H "Accept: application/json"
```

Key response fields: `results[].id`, `results[].key`, `results[].name`, `results[].type` (global or personal).

### Get Page Children

```bash
curl -s -X GET \
  "$CONFLUENCE_BASEURL/api/v2/pages/123456/children?limit=25" \
  -u "$CONFLUENCE_EMAIL:$CONFLUENCE_TOKEN" \
  -H "Accept: application/json"
```

### Add Labels to Page

```bash
curl -s -X POST \
  "$CONFLUENCE_BASEURL/rest/api/content/123456/label" \
  -u "$CONFLUENCE_EMAIL:$CONFLUENCE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{ "prefix": "global", "name": "runbook" }, { "prefix": "global", "name": "q2-release" }]'
```

### Get Page Comments

```bash
curl -s -X GET \
  "$CONFLUENCE_BASEURL/api/v2/pages/123456/footer-comments?body-format=storage&limit=25" \
  -u "$CONFLUENCE_EMAIL:$CONFLUENCE_TOKEN" \
  -H "Accept: application/json"
```

## Storage Format Reference

Confluence uses XHTML-based "storage format" for page bodies. Key elements:

| Element | Purpose |
|---------|---------|
| `<h1>` to `<h6>` | Headings |
| `<p>` | Paragraphs |
| `<ul>`, `<ol>`, `<li>` | Lists |
| `<table>`, `<tr>`, `<td>` | Tables (use `<th>` for headers) |
| `<ac:structured-macro ac:name="code">` | Code block |
| `<ac:structured-macro ac:name="info">` | Info panel |
| `<ac:structured-macro ac:name="warning">` | Warning panel |
| `<ac:structured-macro ac:name="toc">` | Table of contents |
| `<ac:image><ri:attachment ri:filename="img.png"/></ac:image>` | Embedded image |

## Tips

- **API versions**: Page CRUD uses `/api/v2/pages`. Search and labels still use `/rest/api/content`. Both work with the same auth.
- **Storage vs view format**: Always use `storage` representation when creating/updating pages. The `view` format is rendered HTML for display only.
- **Pagination**: V2 API uses cursor-based pagination. Check `_links.next` in the response for the next page URL.
- **Rate limits**: Confluence Cloud allows ~100 requests per 10 seconds per user.
- **Space IDs vs keys**: V2 API uses numeric `spaceId`. To find a space ID from its key, use `GET /api/v2/spaces?keys=ENG`.
- **Version conflicts**: If an update returns 409, re-fetch the page to get the latest version number and retry.
- **Large pages**: For pages with extensive content, consider reading only metadata first (omit `body-format`) and fetching the body only when needed.
