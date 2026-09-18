# Launch materials

Concise, honest material for publishing OpenDM publicly. Nothing here
invents usage metrics.

## 1. GitHub repo launch description

> **OpenDM — the open-source social automation OS.**
> Turn Instagram comments, DMs and story replies into workflows you own:
> visual automations (trigger → conditions → actions), unified inbox, mini-CRM,
> tracked links and real analytics. Official Meta APIs only — no scraping, no
> passwords. Self-hosted: Next.js + PostgreSQL + Redis + a standalone worker.

## 2. LinkedIn project description

> I open-sourced OpenDM — a self-hosted social automation engine built
> to replace black-box comment→DM tools for creators, agencies and local
> businesses.
>
> What makes it different:
> - A real automation engine (trigger → conditions → actions, with delays and
>   branches), not a hardcoded flow.
> - Observability: every run is an execution with per-step status, retries
>   and errors.
> - Your data stays yours: Postgres + Redis on your infra, official Meta APIs,
>   tokens encrypted at rest.
> - Extensible: export/import automations as portable JSON, webhook to n8n/
>   Make/your CRM with HMAC signatures, provider layer ready for more
>   platforms.
> - Demo mode: explore the whole product without Instagram credentials.
>
> Stack: Next.js 14, TypeScript (strict), Prisma/PostgreSQL, BullMQ/Redis,
> Vitest. MIT license. [link]

## 3. Resume / project bullet

> **OpenDM — open-source social automation platform (0→1)**
> Designed and built a self-hosted automation OS for Instagram-driven
> businesses: visual workflow builder, unified inbox, mini-CRM, tracked-link
> analytics, AI-assisted campaign drafting, and a queue-backed execution
> engine (BullMQ/Redis) with idempotent, observable runs. 28-table relational
> schema, strict workspace tenancy, AES-256-GCM token encryption, webhook
> security (HMAC + signature verification), 65 passing unit/integration
> tests, full production build, docs and CI. Next.js 14 · TypeScript ·
> Prisma/PostgreSQL · BullMQ/Redis · Vitest.

## 4. 30-second product demo flow

1. Landing page → **Explore the demo** (one click into demo mode).
2. **Automations** — a Comment-GUIDE flow renders as Trigger → Conditions →
   Actions; hit **Test** to show the dry-run verdict.
3. **Test webhook simulation** already ran: open **Executions** → a
   COMPLETED run with all three steps (public reply, DM w/ link, tagged).
4. Open the **contact** — timeline shows the comment, the DM, the tag.
5. **Analytics** — real funnel numbers (comments → DMs → clicks), top
   keywords, account health.
6. **Settings** — connected demo account. Close with: *"Self-hosted, official
   APIs, your data."*

## 5. 60-second Instagram Reel demo flow

- 0–5s Hook: split-screen "comments spam your inbox" → "one flow handles it".
- 5–15s The builder: trigger → conditions → actions (visual flow with the
  big accent trigger node).
- 15–30s The payoff: a simulated comment appears → execution runs →
  public reply + DM with tracked link + tag — shown via the executions
  timeline and inbox.
- 30–45s CRM + analytics: contact profile with tags, funnel graph.
- 45–55s The pitch cards: "Official Meta APIs · no scraping", "Self-hosted,
  your data", "Open source".
- 55–60s CTA: link in bio → GitHub.

Capture tips: use the built-in demo workspace, `DEMO_MODE=true`, a 1440×2560
viewport, and strip any dev-token leaks (no real credentials appear anywhere
in demo mode).

## 6. Key technical talking points

- Event→conditions→actions engine with **idempotent executions**
  (`(provider, providerEventId)` unique keys) — redelivered webhooks can't
  double-send.
- **Queue-backed everything**: BullMQ ingest/execute/actions/webhooks with
  per-account rate limits and exponential backoff; the web server only
  enqueues and returns 200.
- **Security by default**: Meta webhook signature verification, CSRF
  cookie+header pairing, hashed sessions, AES-256-GCM at-rest tokens,
  SSRF-safe destinations, HMAC-signed outbound webhooks, strict workspace
  tenancy.
- **Portable automations**: versioned JSON export/import with strict
  validation and link re-wiring across instances.
- **AI-assisted but approval-gated**: rewrite / campaign generation /
  insights via a provider abstraction — drafts only, never auto-sent.
- **Testability**: 65 tests incl. workspace isolation + import roundtrip;
  demo mode runs the real queue path against a mock provider.

## 7. Architecture talking points

- Next.js 14 App Router (web + API) — Prisma/PostgreSQL — BullMQ/Redis —
  standalone worker with heartbeat + graceful shutdown.
- 28 intentional tables with cascade policies chosen per relationship;
  `workspaceId` on every tenant row; indexes on hot filters.
- Provider abstraction (`SocialProvider`/`TriggerProvider`/`ActionProvider`
  concepts) — Instagram v1, roadmap for Facebook/WhatsApp/TikTok/LinkedIn/X,
  honestly presented.
- Two deployables (web, worker) + managed PG/Redis; one command local dev;
  Dockerfile + systemd/PaaS notes.

## 8. Why this is different from existing tools

- **Self-hostable** — data and tokens stay on your infra (ManyChat et al.
  are closed SaaS with per-message billing).
- **Engine, not a template** — conditions/actions/delays/branches compose;
  OpenReply-style single-purpose comment→DM tools hardcode one flow.
- **Observable executions** — every run, step, retry and error is inspectable
  in the UI; most tools log nothing.
- **Programmable** — webhooks, portable JSON, API routes; plug into n8n,
  Make, Zapier and custom CRMs.
- **Honest about API limits** — messaging windows and follower gates are
  surfaced with readable reasons instead of silent failures or scraper hacks.
- **Premium UX without bloat** — a readable visual flow instead of a node
  editor, real analytics with honest empty states, dark mode, mobile-ready.