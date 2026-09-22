# Meta / Instagram setup

OpenDM only uses official Meta APIs: Instagram Messaging (DMs), comment
replies via the Graph API, and Instagram webhooks. No scraping, no browser
automation, no passwords.

## 1. Meta app — read this whole section before touching `.env`

This product uses **Instagram API with Instagram Login** (direct login, no
Facebook Page required) — not "Facebook Login for Business" / the classic
Page-mediated Instagram Graph API. They look similar in Meta's console and
it is very easy to end up half-configured for the wrong one. Every symptom
below was hit for real building this integration; follow the steps in order
and you will not see any of them.

1. Create a **Business** app at <https://developers.facebook.com/apps>.
2. On the app dashboard, go to **Use cases** → **Add use cases** → add
   **"Manage messaging & content on Instagram"** (this is what registers the
   Instagram Login product; it will *not* appear as a separate top-level
   "Instagram" item in the left sidebar — it lives under this use case and
   under "Facebook Login for Business").
3. Open that use case → **Customize**. This page has its own **Instagram App
   ID** and **Instagram App secret**, shown near the top — **these are not
   the same as the app's main App ID/Secret under App settings → Basic.**
   Use the Instagram-specific ones for `META_APP_ID` / `META_APP_SECRET` in
   `.env`. Using the main app credentials produces
   `Invalid Request: ... Invalid platform app` at the authorize step, with
   no other indication of what's wrong.
4. On that same Customize page, complete **step 4, "Set up Instagram
   business login"** — click **Set up**. This is a separate activation step;
   without it you'll also get `Invalid platform app`.
5. Still on that step, click **"Business login settings"** and add your
   redirect URI there:
   `https://your-host/api/providers/instagram/callback`.
   **This is a different field from the "Valid OAuth Redirect URIs" list
   under "Facebook Login for Business → Settings"** — filling in only the
   Facebook Login one (which is what you'd naturally find first) does not
   register it for Instagram Login, and you'll still get rejected.
6. Add your Instagram account under **App roles → Roles → Instagram
   Testers**, then — separately — accept that invite **on Instagram itself**:
   Settings → Apps and Websites → **Tester Invites** tab. Adding the tester
   in the developer console only sends the invite; the account must accept
   it from the Instagram side before it can complete OAuth while the app is
   in Development mode.

## 2. Permissions

The product requests these OAuth scopes during "Connect real Instagram":

| Scope | Purpose |
| --- | --- |
| `instagram_business_basic` | read account identity |
| `instagram_business_manage_messages` | send DMs, read conversations |
| `instagram_business_manage_comments` | read comments, reply publicly |

**Do not add `business_management`** — it's a Facebook Business Manager
scope that doesn't exist on this API. Requesting it makes Meta reject the
*entire* authorize request as `Invalid platform app`, with an error message
that gives no hint the scope list is the problem. If you ever need to
double-check the exact working scope list and authorize-URL shape for your
app, the "Set up Instagram business login" step (§1.4) shows a live
"Embed URL" sample generated from your actual app config — diff your
generated URL against it field-by-field if anything is rejected.

For live use Meta requires **App Review + Business Verification** for these
advanced permissions. In Development mode with your own account as a tester
(§1.6), everything works locally.

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

Settings → Connections → **Connect real Instagram** opens Instagram's own
login/consent dialog (`www.instagram.com/oauth/authorize`, not
`facebook.com`). The authorize URL includes `force_reauth=true` — without it
Meta rejects the request the same way it does a bad scope list
(`Invalid platform app`), with nothing pointing at the actual cause. The
callback exchanges the code for a short-lived token via
`api.instagram.com/oauth/access_token` (POST, form-encoded — not a GET
query string), exchanges that for a 60-day long-lived token via
`graph.instagram.com/access_token`, resolves the account via `GET /me`
(the id field on this API is `user_id`, not `id`), encrypts the token with
`ENCRYPTION_KEY` (AES-256-GCM), and marks the connection ACTIVE. Every
subsequent Graph call for this connection also goes to
`graph.instagram.com`, never `graph.facebook.com`.

### Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Invalid Scopes: instagram_business_basic, ...` on `facebook.com/dialog/oauth` | Authorizing through the wrong host | Should never happen with the shipped code — the authorize URL is `instagram.com`, not `facebook.com` |
| `Invalid Request: ... Invalid platform app` | Wrong App ID/Secret (main app creds instead of the Instagram-specific ones, §1.3); missing "Set up Instagram business login" (§1.4); redirect URI only registered under Facebook Login, not Business login settings (§1.5); `business_management` in the scope list (§2); missing `force_reauth=true` | Work through §1 in order; diff your generated authorize URL against the "Embed URL" sample on the Customize page |
| Connect succeeds but the account shows as literal `pending`/`@pending` | Symptom of a now-fixed bug: the mock provider and real adapter shared a registry key and the mock silently won every lookup. Already fixed — if you see this on current code, `getSocialProvider("instagram")` is not returning `InstagramProvider`; check `src/modules/providers/registry.ts` | — |
| OAuth succeeds, then a 404 | A redirect target that doesn't exist | Already fixed (`/app/settings`, not `/app/settings/connections`) — if you see this on current code, check for a stale redirect path |
| Real account added as an Instagram Tester still can't complete login | Invite sent but not accepted | Accept it on Instagram itself: Settings → Apps and Websites → Tester Invites (§1.6) |
| Account connects fine, webhook test succeeds, but real new comments never trigger anything | The app-level webhook config (§3) says what an opted-in account's events look like — it does not opt any account in. Each connected account must separately call `POST /me/subscribed_apps?subscribed_fields=comments,messages` with its own token | Already automatic on every new connect and on every "check health" click, so this shouldn't recur — if it does on current code, check `subscribeToWebhooks` is being called and its response actually has `success: true` |

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
| **Comment → first DM** | The first DM to a commenter who never messaged you is sent as a private reply (`recipient.comment_id`), once per comment. Plain user-id recipients only work after the user messages you first |
| **Existing comments** | "Run on existing comments" (automation page, comment triggers) scans your recent posts/reels, skips comments you already replied to, previews the count, then runs the automation. Idempotent: running it twice never double-sends. Comments older than 7 days can't receive the DM |
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