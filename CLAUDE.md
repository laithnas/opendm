# CLAUDE.md

Companion context for Claude Code / Codex-style agents. For full guidance see
AGENTS.md (agents) and CONTRIBUTING.md (humans).

## Repo map

```
src/lib/        infra (db, redis, queue, crypto, logger, security, http, errors, client)
src/auth/       sessions, magic links
src/modules/    automations · engine · providers · instagram · contacts · inbox ·
                links · analytics · ai · templates · workspaces · audit
src/worker/     ingest / execute / actions / webhooks processors
src/app/        API routes + App Router pages
prisma/         schema + migrations + seed
```

## Non-negotiable invariants

1. Workspace access control runs through `getMembership`/`requireWorkspaceRole`
   — never raw `findMany({ where: { id } })` for user-supplied workspace ids.
2. `apiRoute()` is the only API entry point for workspace routes.
3. All writes that can fail/retry go through queues; route handlers return fast.
4. Executions are idempotent via `(provider, providerEventId)`.
5. Destinations (links + outbound webhooks) pass `validateDestination()`.
6. AI output is never auto-sent; it lands as a draft the user applies.
7. No `console.log` — use the structured logger (`src/lib/logger.ts`).

## Shell quirk

`export NODE_ENV=development` before `npm install` (bash on Windows exports
`production` by default in some setups → devDeps skipped, mysterious missing
binaries).

## Common commands

```bash
npm run dev:all          # app + worker (two processes via concurrently)
npm run worker           # standalone worker
npm run db:seed          # reset + seed demo workspace
npm run test             # vitest (65 tests, needs Docker PG + Redis)
NODE_ENV=production && npm run build
```