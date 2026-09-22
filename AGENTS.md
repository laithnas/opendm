# AGENTS.md

Guidance for AI/agent contributors working in this repository. Human
contributors should read CONTRIBUTING.md too.

**Setting up a real Instagram connection or deploying this?** Read
`docs/meta-setup.md` §1 in full *before* creating the Meta app or writing
`.env` — the Meta console setup has several non-obvious steps (a separate
Instagram-specific App ID/Secret, a login-activation step, a second redirect
URI field) that produce an opaque `Invalid platform app` error if skipped,
with no indication which step was missed. Read `docs/deployment.md` before
picking a hosting setup — Vercel's Deployment Protection and Neon's pooled
connections both have easy-to-hit footguns documented there.

## Environment (Windows/MSYS gotcha)

This repo is developed on Windows with git-bash. The shell may export
`NODE_ENV=production`, which makes `npm install` skip devDependencies
(typescript, vitest, tailwind…). Always:

```bash
export NODE_ENV=development   # before npm install / dev / typecheck
```

Production builds must run with the opposite:

```bash
NODE_ENV=production npm run build
```

Never run `next build` while `next dev` is running against the same `.next`.

## Architecture in one breath

- Next.js 14 App Router. API routes under `src/app/api/**/route.ts` use the
  `apiRoute()` wrapper from `src/lib/api.ts` (auth, workspace enforcement,
  zod body validation, CSRF, structured error JSON).
- Services live in `src/modules/<domain>/` and never import `next/headers` or
  `Request`. Pure logic (conditions, rendering, validation, window rules)
  lives apart from DB code so it is unit-testable.
- Everything async goes through BullMQ queues (see `src/lib/queue.ts`); the
  web server only enqueues. Worker processors live in `src/worker/`.
- The data model is one Prisma schema; every change = one migration.
- Tests: Vitest. DB tests use `leonyx_flow_test` (see `vitest.setup.ts`).

## Landmines

- **`WorkspaceContext.id` is the MEMBERSHIP id.** `getMembership()` returns
  `WorkspaceMember` spread, so `.id` resolves to the member row. Use
  `ctx.workspace!.workspaceId` for the workspace id everywhere. This bit us
  once; it will bite again.
- Provider kinds are lowercase in events (`"instagram"`) but the DB enum is
  uppercase (`"INSTAGRAM"`). Normalize with `.toUpperCase()` at the boundary
  (`contacts`, `inbox` services do this centrally).
- `prisma.aIUsage` is generated as lowercase `aIUsage` (Prisma acronym rule).
- `InteractionKind` has no `DM` — map `DM` → `DM_INBOUND` when recording.
- Messaging window: DMs to conversations older than 7 days are blocked by the
  service BEFORE hitting Meta — keep that message user-readable.
- Logs redact `token|secret|password|apikey|authorization|cookie|session`
  shaped keys at the top level of the payload. Keep secrets in dedicated
  fields, not inside generic `meta` objects that could be logged wholesale.
- `SocialProvider.kind` is a registry key (`src/modules/providers/registry.ts`)
  — `register()` silently overwrites on a duplicate key, so two adapters
  sharing a `kind` means the one registered last wins for *every* lookup,
  including real (non-demo) connections. This actually happened (mock
  shadowed the real Instagram adapter for every connection until it was
  caught) — if you add a new adapter or variant, give it its own kind and
  route to it explicitly (see `getProviderForConnection`), never reuse an
  existing provider's kind.

## Testing expectations

- New pure logic → unit test next to the source (`*.test.ts`).
- New service over the DB → integration test in `src/modules/integration.test.ts`
  or a domain test using `resetDb()`.
- A fix for a failure must ship with a test that reproduces the failure.
- `npm run test` must be green before a PR; builds must pass with
  `NODE_ENV=production`.

## Definition of done

Code merges when: typecheck clean, lint clean (0 problems), tests pass,
production build passes, docs updated where behavior changed, no secrets
committed, migrations committed.