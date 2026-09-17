# Leonyx Flow

**Open-source social automation OS for creators, agencies and businesses.**

Turn Instagram comments, DMs and story replies into workflows you own — with a visual automation builder, unified inbox, mini-CRM, tracked links, real analytics and official Meta APIs. No scraping, no passwords.

> ⚠️ **Project status:** active development (v0.1.0). Core flows are tested and runnable; see [Roadmap](#roadmap) for what's next.

![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6) ![Next.js](https://img.shields.io/badge/Next.js-14-000000) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1) ![Redis](https://img.shields.io/badge/Redis-7-dc382d) ![License](https://img.shields.io/badge/License-MIT-green)

---

## Why

Most comment-to-DM tools are closed SaaS with per-message pricing and no data access. Leonyx Flow is:

- **An automation engine, not a single hardcoded flow.** Trigger → conditions → actions → delay → next action. New triggers and actions register without touching the core.
- **Self-hostable.** Your data, your Postgres, your Redis, your worker. No page-scraping, no browser automation, no passwords — official Meta Graph API only.
- **Observable.** Every run is an execution with per-step status, retries, errors and durations. Queue health is one endpoint away.
- **A foundation to build on.** Export/import automations as portable JSON, hit webhooks (n8n, Make, Zapier, custom CRMs) with HMAC signatures, and extend the provider layer for Facebook/WhatsApp/TikTok later.

## Features

| Area | What you get |
| --- | --- |
| **Automations** | Triggers: comment, DM, story reply. Conditions: keywords (any/all, case, whole-word), exclusions, specific post, follower gate. Actions: DM, public reply, tracked link, tag, webhook, delay. Enable/pause/duplicate/edit/archive/test/export/import. |
| **Visual builder** | Readable Trigger → Conditions → Actions flow — no node editor maze. Live dry-run "Test" before activating. |
| **Inbox** | Conversations from DMs + story replies, unread state, search, reply with messaging-window enforcement shown honestly. |
| **Mini-CRM** | Contacts, tags, notes, engagement timeline, link clicks, campaign history. Privacy-conscious: only what the API legally exposes. |
| **Tracked links** | Non-guessable slugs, clicks + unique clicks, CTR, validated destinations (open-redirect/SSRF-safe). |
| **Analytics** | Triggers, DMs sent/failed, clicks, CTR, top automations, top keywords, conversion funnel, account + queue health. Real numbers only. |
| **AI (optional)** | Message rewrite, campaign generation, suggestions, insight summaries via Anthropic/OpenAI/Gemini. Never sent without your approval. |
| **Templates** | 10 ready flows (Comment GUIDE, Comment PRICE, lead magnet, webinar, real estate, restaurant, agency leads, newsletter…) instantiated as editable drafts. |
| **Team** | Workspaces with owner/admin/member roles, invites, full audit log. |
| **Demo mode** | One click: seeded workspace with campaigns, contacts, executions and inbox conversations. Perfect for exploring or recording demos. |

## Architecture

```
Web / API (Next.js 14)
     │  webhook handler returns 200 immediately
     ▼
BullMQ queues (Redis) ──── ingest ──► automation-execute ──► actions ──► webhook-deliver
     │
     ▼
Standalone Worker (own process, graceful shutdown, heartbeat)
     │
     ▼
PostgreSQL (Prisma)      contacts · conversations · executions · steps · links · clicks
```

- **Idempotency:** executions keyed on `(provider, providerEventId)` — redelivered webhooks never duplicate DMs.
- **Rate limits:** per-connected-account throttle on the actions queue; exponential backoff; dead-letter retention.
- **Security:** webhook signature verification (`X-Hub-Signature-256`), CSRF cookie+header pairing, session tokens hashed at rest, provider tokens AES-256-GCM encrypted, HMAC-signed outbound webhooks, SSRF-safe destinations, workspace isolation enforced server-side.

See [docs/architecture.md](docs/architecture.md) for the full walkthrough.

## Quick start (local development)

Requirements: Node 20+, Docker.

```bash
cp .env.example .env          # defaults work for local dev (DEMO_MODE=true)
docker compose up -d          # PostgreSQL + Redis
npm install
npm run db:migrate            # apply schema
npm run db:seed               # optional: demo workspace with realistic data
npm run dev:all               # app on http://localhost:3000 + worker
```

Open <http://localhost:3000>, sign in with the magic link (printed in the server log when no email transport is configured) or use **Explore the demo**.

Without demo mode: `npm run dev` and `npm run worker` in separate terminals.

> Runtime env validation is strict — a missing key fails fast with a readable message. The `NODE_ENV` of the shell must be `development` for `npm install` to include dev dependencies.

## Meta / Instagram setup

1. Create a Facebook App (Business type) at <https://developers.facebook.com/apps>.
2. Add the **Instagram** product; note your App ID and App Secret.
3. Set `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` in `.env`.
4. Configure the webhook (callback URL `https://your-host/api/webhooks/instagram`) for the `instagram` object → `comments` and `messaging` fields.
5. Connect the account from **Settings → Connections** (Meta Login for Business).

App review permissions: `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`, `business_management`. Full walkthrough + limitation notes in [docs/meta-setup.md](docs/meta-setup.md).

## Production deployment

- **Postgres + Redis:** managed services or Docker.  
- **App:** `npm run build && npm start` (any Node host, Dockerfile included).  
- **Worker:** run `npm run worker` as its own process (systemd unit / separate container) — background work never depends on the web server.  
- **Env:** set `NODE_ENV=production`, strong `SESSION_SECRET` + `ENCRYPTION_KEY` (`openssl rand -base64 32`), `APP_URL`, real `DATABASE_URL`/`REDIS_URL`.

See [docs/deployment.md](docs/deployment.md).

## Testing

```bash
npm run lint          # ESLint (0 problems expected)
npm run typecheck     # tsc --noEmit
npm run test          # Vitest: unit + integration (needs Docker Postgres; uses leonyx_flow_test)
npm run build         # production build
```

Current coverage: keyword/condition logic, template rendering, import/export validation, destination security, HMAC + Meta signature verification, CSRF pairing, messaging window, workspace isolation, invites/roles, automation CRUD, export/import roundtrip, tracked-link click accounting.

## Docs

- [docs/architecture.md](docs/architecture.md) — system design, domains, data model
- [docs/setup.md](docs/setup.md) — environment reference
- [docs/deployment.md](docs/deployment.md) — production runbook
- [docs/meta-setup.md](docs/meta-setup.md) — Instagram API + webhooks + app review
- [docs/automation-engine.md](docs/automation-engine.md) — trigger/condition/action reference, variables, export schema
- [docs/webhooks.md](docs/webhooks.md) — inbound verification + outbound deliveries
- [docs/security.md](docs/security.md) — threat model and mitigations
- [docs/troubleshooting.md](docs/troubleshooting.md) — common issues
- [docs/launch.md](docs/launch.md) — public-launch materials

## Screenshots

Screenshots are captured from the built-in demo workspace (one-click demo
login, no Meta credentials needed). To regenerate them on any machine:

1. `docker compose up -d && npm run db:seed && npm run dev:all`
2. Open http://localhost:3000 → **Explore the demo**
3. Capture: Automations (flow cards), Builder (edit Comment GUIDE), Inbox,
   Contact profile, Analytics, Settings → Connections.

> PRs that refresh or add screenshots are very welcome — a fresh capture of
> the dashboard and the builder keeps the README honest.

## Roadmap

- Authentication hardening: OAuth (Google) + passwords (2FA later)
- Stripe self-serve billing (per-workspace plans)
- Instagram: post picker for "specific post", follower-status via advanced access, insights snapshots
- Provider adapters: Facebook, WhatsApp, TikTok, LinkedIn, X (roadmap only — no fake support)
- Automation version history, per-step retry UI, queue monitor page
- n8n node package + Zapier connector

## Contributing

PRs welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## License

MIT © Leonyx AI — see [LICENSE](LICENSE). Built by Laith Nasrallah / Leonyx AI.

**Topics:** `instagram` · `automation` · `social-media` · `manychat-alternative` · `nextjs` · `typescript` · `self-hosted` · `creator-tools` · `marketing-automation` · `open-source`