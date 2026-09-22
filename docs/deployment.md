# Deployment

## Topology

Two deployables, one database, one Redis:

```
Production host / container A:  next start   (web + API)
Production host / container B:  node worker  (npm run worker — or the image with CMD worker)
PostgreSQL + Redis: managed services or the included compose file
```

The worker must run **once** (scale = 1) unless you accept duplicate-delivery
risk; BullMQ re-queues stalled jobs and the engine is idempotent on events,
so N workers are safe for ingest/execute/actions, but deliveries keyed by
`delivery.id` also re-check status. Start with 1 worker, measure, then scale.

## Docker

Build the image (multi-stage, includes worker entrypoint):

```bash
docker build -t leonyx-flow .
# web
docker run -p 3000:3000 --env-file .env leonyx-flow
# worker (same image, different command)
docker run --env-file .env leonyx-flow bash -c "npm run worker"
```

`docker compose` in this repo ships Postgres + Redis only; the app is
expected to run on a PaaS (Vercel/Railway/Fly) or a VM.

## Vercel / PaaS notes

- Node 20 runtime.
- Set every variable from `.env.example`; generate real secrets.
- `DEMO_MODE` must be `false`.
- Worker cannot run on Vercel — use a fly.io machine, Railway service, or a
  small VM running `npm run worker`. The web app degrades gracefully
  (everything enqueues; nothing executes) until the worker is up.
- Webhook endpoint must be publicly reachable; configure the Full-Stack
  (not serverless-edge) runtime.
- **Disable Vercel's Deployment Protection ("Vercel Authentication"/SSO
  Protection)** on the project (Settings → Deployment Protection). It's on
  by default for new projects and sits in front of the app at the platform
  level — it rejects POST requests outright (`405`, no useful body) instead
  of showing its own login, which is very easy to mistake for a bug in the
  app itself. The app has its own auth; you don't want two layers.
- **Using Neon:** don't run `prisma migrate deploy` as part of the Vercel
  build command. Migrations need a Postgres advisory lock, which doesn't
  reliably work over Neon's pooled (pgbouncer) connection *or* over the
  "unpooled" one from a cold Vercel build machine — both can hit
  `P1002 ... Timed out trying to acquire a postgres advisory lock` well
  within Prisma's fixed lock-acquire timeout. Run migrations separately
  (locally against `DATABASE_URL`, or via a one-off script) before or after
  deploying, not inside `buildCommand`.

## Systemd example (single VM)

```ini
# /etc/systemd/system/leonyx-flow-web.service
[Unit]
Description=OpenDM web
After=network.target

[Service]
WorkingDirectory=/opt/leonyx-flow
EnvironmentFile=/opt/leonyx-flow/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
User=leonyx

[Install]
WantedBy=multi-user.target
```

Same file with `ExecStart=/usr/bin/npm run worker` for the worker unit.

## Operational checklist

- TLS termination and `APP_URL=https://…`.
- Backups: `pg_dump` schedule; Redis appendonly (compose enables it).
- Watch `/api/health` (app/db/redis/worker) — alert when `worker !== "ok"`.
- Watch BullMQ failed sets (`/api/health` doesn't show them yet; logs print
  `job failed` with jobId + queue).
- Validate failed executions in the UI: each failed step carries the provider
  error, and webhook deliveries show HTTP status + last error.
- Rotate `ENCRYPTION_KEY` carefully — it invalidates stored tokens
  (contacts must reconnect).

## Scaling notes

- Reads: Postgres indexes cover the hot paths (workspace + created-at, status
  filters); analytics run a handful of aggregate queries per dashboard load —
  fine into tens of thousands of executions; add materialized rollups when
  they aren't.
- Writes: all user-facing writes are short transactions; burst traffic lands
  in queues and drains at account rate limits, so the DB never sees a stampede
  of provider calls.
- Memory: BullMQ jobs are small JSON; retention cleanups prune completed jobs
  (30 days).