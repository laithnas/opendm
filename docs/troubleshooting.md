# Troubleshooting

## App won't start — "Invalid environment configuration"

Runtime env validation is strict. Check `.env` against `.env.example`:
`DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET` (≥16 chars) and
`ENCRYPTION_KEY` (≥16 chars) are required. Errors list the exact key.

## npm install skips packages / `tsc` missing

This shell (Windows git-bash) exports `NODE_ENV=production`, so npm skips
devDependencies. Fix:

```bash
export NODE_ENV=development && npm install
```

## `next build` fails with `<Html> should not be imported outside of pages/_document`

Two causes: running build while `next dev` is alive (stop it first), or
building with `NODE_ENV=development` (dev runtime chunks leak in). Always:

```bash
NODE_ENV=production npx next build
```

## Webhooks from Meta return 401

`META_APP_SECRET` mismatch. The signature is computed over the **raw body** —
make sure no proxy reformats it (nobody reads the body before the signature
check in this app). Confirm `META_VERIFY_TOKEN` matches the dashboard value
(GET verification).

## Executions stay `SKIPPED`

Expected when conditions don't match — read the execution detail: the
`error` column carries the failing condition's reason. The demo "skips" for
every non-matching automation by design (observability over silence).

## DMs fail with "outside the messaging window"

Instagram rule, not a bug: business DMs are only allowed within 7 days of
the user's last inbound message. The inbox shows the exact window state;
automation DM steps record `SKIPPED` + reason. Public comment replies are
not window-bound.

## Worker down / jobs pile up

Check `/api/health` — the `worker` field reports heartbeat age. Start the
worker (`npm run worker`), jobs resume; stalled jobs are re-queued by BullMQ
automatically. Queue health numbers (waiting/active/failed) are visible via
the BullMQ API if you expose queues; for now the health endpoint covers
liveness.

## Tracked link redirects to the homepage

The slug doesn't exist (or belongs to another workspace after a re-seed).
Links are intentionally non-guessable; create a new one.

## Import says "references link slug …"

Portable imports require `linkDestination` in `SEND_LINK` actions so the
importing instance can mint its own tracked link. Export before editing
templates, or add the destination.

## Demo seeded data gone

`npm run db:seed` resets the demo workspace (idempotent). Demo credentials:
`demo@leonyx.local` via the **Explore the demo** button.

## Analytics shows zeroes in demo

Analytics only counts real rows (executions, messages, clicks). The seed
creates ~35 executions and ~65 clicks over the last 30 days — widen the date
range or seed again. Nothing is fake; empty states are honest by design.

## Postgres test DB missing for `npm run test`

```bash
docker exec leonyx-flow-postgres-1 psql -U leonyx -d postgres -c "CREATE DATABASE leonyx_flow_test"
```

## Ports in use

App: 3000. Postgres: 5432. Redis: 6379. Change the app port with
`npm run dev -- -p 3200` and update `APP_URL`.

## Still stuck?

Open an issue with: log lines (secrets redacted!), the `.env` keys you set
(names only), and what you expected vs saw.