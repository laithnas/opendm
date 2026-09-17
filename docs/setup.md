# Setup

## Requirements

- Node.js ≥ 20
- Docker (PostgreSQL 16, Redis 7) — or any reachable PG/Redis
- npm ≥ 10

## One-command setup (recommended)

```bash
git clone https://github.com/laithnas/leonyx-flow
cd leonyx-flow
npm install
npm run init          # .env (random secrets) + Postgres + Redis + migrations
npm run dev:all       # app on :3000 + worker
```

`npm run init` is idempotent and supports `--seed` (demo workspace) and
`--no-docker` (external Postgres/Redis). It never overwrites an existing
`.env`. Manual steps below for those who prefer them.

```bash
cp .env.example .env
docker compose up -d
npm install            # needs NODE_ENV=development in this shell
npm run db:migrate
npm run db:seed        # optional demo workspace
npm run dev:all        # app :3000 + worker
```

Open http://localhost:3000 → login → **Explore the demo** (demo mode) or use
the magic link (printed to the server log when `RESEND_API_KEY` is empty).

## Environment reference

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `APP_URL` | prod | http://localhost:3000 | public origin (links, redirects, emails) |
| `APP_NAME` | no | Leonyx Flow | product name shown in UI — the rename switch |
| `COMPANY_NAME` | no | Leonyx AI | footer/vendor name |
| `DEMO_MODE` | no | false | enables seeded demo login + test webhook |
| `DATABASE_URL` | yes | — | Postgres DSN |
| `REDIS_URL` | yes | redis://localhost:6379 | queue + rate limits |
| `SESSION_SECRET` | yes | — | salts session/IP hashing (≥32 bytes) |
| `ENCRYPTION_KEY` | yes | — | AES-256 key for provider tokens (32 bytes) |
| `RESEND_API_KEY` | no | — | magic-link email transport; empty ⇒ console link |
| `EMAIL_FROM` | no | Leonyx Flow <no-reply@…> | sender address |
| `META_APP_ID` | no* | — | Facebook app id (real IG connect) |
| `META_APP_SECRET` | no* | — | webhook signature + OAuth code exchange |
| `META_VERIFY_TOKEN` | no* | — | webhook subscription verification |
| `META_GRAPH_VERSION` | no | v21.0 | Graph API version |
| `AI_PROVIDER` | no | — | `anthropic`/`openai`/`gemini`; empty disables AI |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | no | — | provider keys (only the selected provider matters) |
| `ANTHROPIC_MODEL` / `OPENAI_MODEL` / `GEMINI_MODEL` | no | defaults | model overrides |
| `QUEUE_PREFIX` | no | leonyx-flow | Redis key prefix (multitenant redises) |
| `WORKER_CONCURRENCY` | no | 10 | jobs per queue worker |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | no | 2 / 1000 | per-account outbound throttle |
| `LOG_LEVEL` | no | info | debug/info/warn/error |

\* Optional for demo/dev; required for real Instagram connections.

Generate secrets:

```bash
openssl rand -base64 32   # → SESSION_SECRET
openssl rand -base64 32   # → ENCRYPTION_KEY
```

## Test database

Integration tests use `leonyx_flow_test` (created automatically by `docker
compose`? No — create once):

```bash
docker exec leonyx-flow-postgres-1 psql -U leonyx -d postgres -c "CREATE DATABASE leonyx_flow_test"
```

Override via `TEST_DATABASE_URL` if your topology differs. Tests run
`prisma migrate deploy` against it automatically.

## Renaming the product

Change `APP_NAME` in `.env` (and `APP_URL` branding in `src/config.ts`). One
env var — no code changes.