# OpenDM

**Open-source social automation OS for creators, agencies and businesses.**

Turn Instagram comments, DMs and story replies into workflows you own — visual
automations (trigger → conditions → actions), unified inbox, mini-CRM,
tracked links and real analytics. Official Meta APIs only — no scraping, no
passwords.

![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6) ![Next.js](https://img.shields.io/badge/Next.js-14-000000) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1) ![Redis](https://img.shields.io/badge/Redis-7-dc382d) ![Tests](https://img.shields.io/badge/tests-65%20passing-brightgreen) ![License](https://img.shields.io/badge/License-MIT-green)

> ⚠️ **Status:** v0.1.0 — core flows tested and runnable. See [Roadmap](#roadmap).

---

## Table of contents

- [Why OpenDM](#why)
- [Features](#features)
- [Quick start (3 commands)](#quick-start-3-commands)
- [What `npm run init` does](#what-npm-run-init-does)
- [Local development](#local-development)
- [Using the app](#using-the-app)
- [Meta / Instagram setup](#meta--instagram-setup)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Production deployment](#production-deployment)
- [Configuration reference](#configuration-reference)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)

---

## Why

Most comment→DM tools are closed SaaS with per-message pricing and no data
access. OpenDM is:

- **An automation engine, not a hardcoded flow.** Trigger → conditions →
  actions → delay → next action. New triggers and actions register without
  touching the core.
- **Self-hostable.** Your data, your Postgres, your Redis, your worker.
- **Observable.** Every run is an execution with per-step status, retries,
  errors and durations.
- **Integratable.** Export/import automations as portable JSON; fire signed
  webhooks into n8n, Make, Zapier or your CRM.
- **Private by design.** Tokens encrypted at rest, no page-scraping, hashed
  IPs, minimal contact data.

## Features

| Area | What you get |
| --- | --- |
| **Automations** | Triggers: comment, DM, story reply. Conditions: keywords (any/all, case-sensitive, whole-word), exclusions, specific post, follower gate. Actions: DM, public reply, tracked link, tag contact, webhook, delay. Enable / pause / duplicate / edit / archive / test / export / import. |
| **Visual builder** | Readable Trigger → Conditions → Actions flow. Inline editors, drag-free reorder, dry-run **Test** before activating, AI draft generation. |
| **Inbox** | Conversations from DMs + story replies, unread state, search, manual replies with messaging-window rules shown honestly. |
| **Mini-CRM** | Contacts, tags, notes, engagement timeline, link clicks, campaign history. |
| **Tracked links** | Non-guessable slugs, clicks + unique clicks, per-campaign CTR, SSRF-safe destinations. |
| **Analytics** | Triggers, DMs sent/failed, click-through, conversion funnel, top automations, top keywords, account health, date filters. Real numbers, honest empty states. |
| **AI (optional)** | Message rewrite, campaign generation, automation suggestions, insight summaries (Anthropic / OpenAI / Gemini). Drafts only — never auto-sent. |
| **Templates** | 10 flows (Comment GUIDE, Comment PRICE, lead magnet, webinar, real estate, restaurant, agency leads, newsletter…) as editable drafts. |
| **Team** | Workspaces with owner/admin/member roles, invites, full audit log. |
| **Demo mode** | One-click seeded workspace — explore the whole product without Instagram credentials. |

## Quick start (3 commands)

Requirements: **Node 20+** and **Docker** (for local Postgres + Redis).

```bash
git clone https://github.com/laithnas/opendm
cd leonyx-flow
npm install && npm run init
npm run dev:all            # app on http://localhost:3000 + worker, together
```

That's it — open http://localhost:3000 and click **Explore the demo**
(or sign in with a magic link, which is printed to the server log until you
configure email).

Want sample data right away? `npm run init -- --seed` seeds a demo workspace
with automations, contacts, executions and conversations.

Already running Postgres/Redis elsewhere? `npm run init -- --no-docker`.
Single-purpose admins: `npm run init -- --seed --no-docker` works too.

## What `npm run init` does

1. **Creates `.env`** from `.env.example` — with *random* `SESSION_SECRET`,
   `ENCRYPTION_KEY` and `META_VERIFY_TOKEN` generated for you (never reuse
   the template's placeholders). An existing `.env` is never overwritten.
2. **Starts PostgreSQL + Redis** (`docker compose up -d`) and waits until
   both report healthy.
3. **Applies migrations** (`prisma migrate deploy`) so the schema matches
   the code.
4. **Optionally seeds** the demo workspace (`--seed`).
5. **Prints next steps**: run commands, login URL, Meta/AI env hooks, docs.

The whole flow is idempotent — run it again any time; it only fills in what
is missing.

## Local development

```bash
npm run dev:all        # app (:3000) + worker, one command (uses concurrently)
# or separately:
npm run dev            # Next.js dev server
npm run worker         # standalone background worker
```

**Why a worker?** All automation work (webhook ingestion, DM sending, link
tracking, webhook deliveries) runs in background queues. The web server only
enqueues and returns immediately — kill the dev server and queued work
survives until the worker picks it up.

### The minimal daily loop

```bash
npm run dev:all
# edit code → app hot-reloads; worker restarts on file changes (tsx watch)
npm run lint && npm run typecheck && npm run test   # before committing
```

### Useful scripts

| Script | Purpose |
| --- | --- |
| `npm run init` | one-command setup (.env + infra + migrate [+ `--seed`]) |
| `npm run dev:all` | app + worker together |
| `npm run worker` | standalone worker process |
| `npm run db:migrate` | apply committed migrations |
| `npm run db:migrate:dev` | create a new migration from schema changes |
| `npm run db:seed` | reset + seed the demo workspace |
| `npm run db:studio` | Prisma Studio (visual DB browser) |
| `npm run test` | Vitest unit + integration suite |
| `npm run typecheck` / `lint` / `build` | quality gates |
| `npm run check` | lint + typecheck + test + build in one go |

## Using the app

1. **Login** — magic link (console-printed until `RESEND_API_KEY` is set) or
   the demo button when `DEMO_MODE=true`.
2. **Create a workspace** — automations, contacts and data are scoped per
   workspace. Invite teammates under Settings.
3. **Build an automation** — *Automations → New automation*: pick a trigger,
   add conditions (keywords, exclusions, post, follower gate), chain actions
   (public reply → DM with `{{link}}` → tag), then **Test** for a dry run and
   **Save & activate**.
4. **Watch it run** — trigger a simulated comment from the test webhook (dev/
   demo) or wait for real Instagram traffic; inspect *Executions* for the
   full run path.
5. **Follow up** — contacts, inbox replies, link click analytics and AI
   summaries close the loop.

### Message variables

`{{username}}` `{{name}}` `{{comment}}` `{{keyword}}` `{{link}}` `{{workspace}}`
— rendered per contact at execution time (see docs/automation-engine.md).

## Meta / Instagram setup

Official Meta Graph API only (no scraping, no passwords):

1. Create a **Business** Facebook App → add the **Instagram** product.
2. In `.env`: `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`.
3. Configure the webhook (callback `https://your-host/api/webhooks/instagram`,
   verify token as set, fields `comments` + `messaging`).
4. Settings → Connections → **Connect real Instagram** (Meta Login for
   Business; requires App Review + Business Verification for production
   permissions).

**What the API allows:** DMs inside the 7-day messaging window (enforced and
explained in the inbox), public comment replies, story replies, up to 3 CTA
buttons per DM; follower status requires Meta advanced access — the
followers-only condition fails closed with a readable reason otherwise.

Full walkthrough and limitation notes: [docs/meta-setup.md](docs/meta-setup.md).

## Project structure

```
src/
  app/            Next.js App Router — API routes + pages
  components/     UI kit + app shell + automation flow visualizations
  lib/            infra: db, redis, queues, crypto, logger, security, http
  auth/           sessions + magic links
  modules/        feature domains:
    automations   CRUD, duplicate, archive, export/import, templates
    engine        conditions, rendering, execution pipeline
    providers     SocialProvider interface, registry, OAuth, token lifecycle
    instagram     Meta Graph client, webhook parser, mock provider
    contacts      mini-CRM (tags, notes, timeline)
    inbox         conversations, messages, messaging-window verdicts
    links         tracked redirects + click accounting
    analytics     SQL aggregates (executions, messages, clicks)
    ai            provider abstraction + features + usage ledger
    workspaces    tenants, members, invites, audit
  worker/         queue processors (ingest → execute → actions → webhooks)
prisma/           schema + migrations + demo seed
scripts/          onboarding (npm run init)
docs/             architecture, setup, deployment, security, automation-engine…
.github/          CI workflow + issue/PR templates
```

More: [docs/architecture.md](docs/architecture.md).

## Testing

```bash
npm run test              # 65 unit + integration tests (needs Docker Postgres)
npm run typecheck         # tsc --noEmit (strict)
npm run lint              # ESLint — 0 problems expected
NODE_ENV=production npm run build   # production build
```

Integration tests run against a disposable `leonyx_flow_test` database and
cover workspace isolation, invites/roles, automation CRUD, export/import
roundtrips and link-click dedup. Unit tests cover conditions, rendering,
schemas, HMAC/hub-signature verification, CSRF pairing and destination
security.

## Production deployment

- **Web:** `NODE_ENV=production npm run build && npm start` — any Node 20
  host, PaaS (Railway/Fly/Render) or the included `Dockerfile`.
- **Worker:** `npm run worker` as its own process/container — background work
  never depends on the web server.
- **Data:** managed PostgreSQL + Redis (or the bundled compose file).
- **Env:** strong `SESSION_SECRET`/`ENCRYPTION_KEY`, `APP_URL = https://…`,
  TLS termination. `DEMO_MODE` must be `false`.

Runbook + systemd examples + scaling notes: [docs/deployment.md](docs/deployment.md).

## Configuration reference

Every variable, with defaults and purposes: [docs/setup.md](docs/setup.md).
Highlights: `APP_NAME` renames the product; `DEMO_MODE` enables the seeded
demo login; `META_*` powers real Instagram; `AI_PROVIDER` + matching key
enable AI; `RESEND_API_KEY` sends magic links by email; `RATE_LIMIT_*` tunes
per-account outbound throttling.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `npm install` skips devDependencies / `tsc` missing | The shell exports `NODE_ENV=production` — run `export NODE_ENV=development && npm install` |
| `next build` fails with `<Html>` error | Build with `NODE_ENV=production` and no dev server running |
| MySQL-less: infra won't start | Docker Desktop off — start it, re-run `npm run init` |
| Meta webhook 401 | `META_APP_SECRET` mismatch; GET verify token must equal `META_VERIFY_TOKEN` |
| Executions stay SKIPPED | Expected when conditions don't match — read the execution detail for the reason |
| DMs fail "outside messaging window" | Instagram rule, not a bug — see inbox explanation |
| Analytics shows zeros | Analytics only counts real rows; demo seed creates the first ones |

More: [docs/troubleshooting.md](docs/troubleshooting.md).

## Contributing

PRs welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) first (code signature,
landmines, test expectations). Security issues: [SECURITY.md](SECURITY.md).

## Roadmap

- Auth hardening: Google OAuth + passwords + 2FA
- Stripe self-serve billing (per-workspace plans)
- Post picker UI for "specific post"; follower snapshots + growth charts
- Provider adapters: Facebook, WhatsApp, TikTok, LinkedIn, X (roadmap only — no fake support)
- Automation version history; queue monitor page; n8n node package
- Playwright E2E suite

## License

MIT © Leonyx AI — see [LICENSE](LICENSE). Built by Laith Nasrallah / Leonyx AI.

**Topics:** `instagram` · `automation` · `social-media` · `manychat-alternative` ·
`nextjs` · `typescript` · `self-hosted` · `creator-tools` · `marketing-automation` · `open-source`