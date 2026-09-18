# Meta / Instagram setup

OpenDM only uses official Meta APIs: Instagram Messaging (DMs), comment
replies via the Graph API, and Instagram webhooks. No scraping, no browser
automation, no passwords.

## 1. Facebook App

1. Create a **Business** app at <https://developers.facebook.com/apps>.
2. Add the **Instagram** product (also called Instagram API with Instagram
   Login).
3. Note `App ID` and `App Secret` → put them in `.env`:
   `META_APP_ID`, `META_APP_SECRET`.

## 2. Permissions

The product requests these OAuth scopes during "Connect real Instagram":

| Scope | Purpose |
| --- | --- |
| `instagram_business_basic` | read account identity |
| `instagram_business_manage_messages` | send DMs, read conversations |
| `instagram_business_manage_comments` | read comments, reply publicly |
| `business_management` | link the business account |

For live use Meta requires **App Review + Business Verification** for these
advanced permissions. In Development mode with your own account as a tester,
everything works locally.

## 3. Webhooks

1. In the app dashboard: **Instagram → Webhooks**.
2. Callback URL: `https://your-host/api/webhooks/instagram`
3. Verify token: exactly what you set as `META_VERIFY_TOKEN`.
4. Subscribe to fields: `comments` and `messaging` (story replies arrive in
   the messaging stream as `post` events — the parser maps them to the
   STORY_REPLY trigger).
5. The app verifies GET challenges and validates every POST with
   `X-Hub-Signature-256` over the raw body using `META_APP_SECRET`.

Test locally: use `ngrok` (or similar) with `APP_URL` = the tunnel origin,
or use the in-app **test webhook** (demo/development only) which simulates
Meta envelopes against the mock provider.

## 4. Connecting accounts

Settings → Connections → **Connect real Instagram** opens Meta Login for
Business. The callback exchanges the code for a long-lived token (≈60 days),
resolves the Instagram business account id, encrypts the token with
`ENCRYPTION_KEY` (AES-256-GCM), and marks the connection ACTIVE.

- **Token refresh:** when `META_APP_ID` + `META_APP_SECRET` are set, the
  refresh endpoint exchanges the current token for a new one before expiry.
- **Health:** a per-connection "check health" button calls the Graph API with
  the stored token and flips the status to ACTIVE/EXPIRED/ERROR with the
  readable last error.

## 5. What the API allows (and what the product does about it)

| Rule | Behavior |
| --- | --- |
| **Messaging window** — business DMs only within 7 days of the user's last message | The inbox computes the window verdict and blocks replies with a clear reason; automation DM actions skip with `reason` instead of failing cryptically |
| **Comment private replies** | Sent via the messaging API to the comment author; Meta enforces its own 7-day comment window — rejections surface as step errors |
| **Public comment replies** | POST `/{comment-id}/replies` — shown in-step as PUBLIC_REPLY |
| **CTA buttons (quick replies)** | up to 3 per DM in this build (platform allows more; configurable cap) |
| **Follower status** | only available with advanced access (`ig_manage_comments` + public content). Without it, the followers-only condition **fails closed** with an explanatory reason |
| **Rate limits** | per-account queue limiter (default 2 msgs/sec at the queue; Meta's own quotas apply) |
| **Webhooks** | Meta may redeliver; executions are idempotent per `(provider, providerEventId)` |

## 6. App Review checklist (going live)

- Business Verification completed.
- Permission requests submitted with demo videos (a Loom of the connect flow
  and a comment→DM walkthrough usually suffices).
- Data deletion requests: Meta requires a deletion endpoint — the platform
  supports deleting workspace data via API/DB; a public data-deletion
  endpoint is on the roadmap (see CHANGELOG).

## 7. Testing without Meta

`DEMO_MODE=true` + `npm run db:seed` gives you a full workspace. The mock
provider simulates DMs/comment replies with failure injection (`<fail>` and
`<ratelimit>` in message text) and the test webhook endpoint
(`POST /api/webhooks/test`) exercises the REAL queue → worker → engine path
with fake events, so development never needs a live Instagram account.