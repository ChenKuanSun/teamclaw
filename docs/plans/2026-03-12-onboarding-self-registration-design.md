# Admin Onboarding + Chat Self-Registration Design

## Goal

Two features to complete the self-service experience:
1. Admin Onboarding Wizard — guide IT admin through first-time setup
2. Chat App Self-Registration — let employees sign up with company email

## Feature 1: Admin Onboarding Wizard

### Trigger

Dashboard page calls `GET /admin/onboarding/status` on load. If any required config is missing, show Onboarding Wizard instead of Dashboard content.

### Backend — New Lambda

`GET /admin/onboarding/status` checks:

| Check | Source | Condition |
|-------|--------|-----------|
| `hasApiKeys` | Secrets Manager | At least one key in any provider |
| `hasTeam` | Teams DynamoDB table | At least one team exists |
| `hasAllowedDomains` | Config table (`global#default`, `allowedDomains`) | Non-empty JSON array |
| `hasDefaultTeamId` | Config table (`global#default`, `defaultTeamId`) | Non-empty string |

Response:
```json
{
  "complete": false,
  "steps": {
    "apiKey": false,
    "team": true,
    "allowedDomains": false,
    "defaultTeamId": false
  }
}
```

### Frontend — Onboarding Wizard (in Dashboard)

Mat-Stepper with 4 steps, shown when `complete === false`:

**Step 1: Add API Key**
- Inline form (not dialog): provider dropdown (Anthropic/OpenAI/Google) + API key input
- Calls existing `POST /admin/api-keys`
- Only one key required, can add more later

**Step 2: Create Team**
- Team name + description inputs
- Calls existing `POST /admin/teams`
- Stores created team ID for Step 3

**Step 3: Set Allowed Domains + Default Team**
- Input for company email domain (e.g. `company.com`)
- Saves `allowedDomains: ["domain"]` via `PUT /admin/config/global`
- Auto-saves `defaultTeamId` from Step 2's team via `PUT /admin/config/global`

**Step 4: Done**
- Summary of what was configured
- "Go to Dashboard" button
- Reloads Dashboard, `onboarding/status` returns `complete: true`

Already-completed steps show as ✓ and are skippable.

## Feature 2: Chat App Self-Registration

### CDK Change

Control Plane stack: enable `selfSignUpEnabled: true` on chat Cognito User Pool + email verification (verification code).

### Frontend — Sign Up Flow

New pages in Chat App:

**`/signup`** — Registration form:
- Email, Password, Confirm Password
- Submit → `CognitoUserPool.signUp()`
- Navigate to `/verify`

**`/verify`** — Email verification:
- 6-digit code input
- Submit → `cognitoUser.confirmRegistration()`
- Success → navigate to `/login`

**Login page** — Add "Sign up" link pointing to `/signup`.

### Authorization Flow

After login, existing Session Lambda handles domain validation:
- Allowed domain → auto-provision → chat
- Not allowed → 403 "Contact your IT administrator"

No Cognito Pre Sign-up Lambda needed — domain check happens at session level.

## Out of Scope

- No Cognito Pre Sign-up Lambda (domain check at session level is sufficient)
- No SOUL.md setup in onboarding (can be done later in Config page)
- No multi-provider forced setup (one API key is enough)
- No password reset flow (Cognito handles this natively)
