# Contributing

Thanks for helping with Leonyx Flow. This project is small, opinionated and
intentionally boring — read the [code signature](#code-signature) section
before sending a PR.

## Getting started

```bash
cp .env.example .env
docker compose up -d
npm install            # NODE_ENV=development required on some shells
npm run db:migrate
npm run db:seed        # optional
npm run dev:all        # app + worker
```

Run the full check before submitting:

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

## Where things live

```
src/lib/          infrastructure: db, redis, queues, crypto, logger, security, http
src/auth/         sessions + magic links
src/modules/      feature domains (workspaces, automations, engine, contacts,
                  inbox, links, analytics, ai, providers, templates, audit)
src/worker/       queue processors (ingest, execute, actions, webhooks)
src/app/          routes (API + pages)
prisma/schema.prisma  the whole data model — one migration per change
```

Rules of thumb:

- **Schemas at boundaries.** Every API body is zod-validated in the route file.
- **Domain logic off the wire.** Services never see `Request` objects.
- **Tenant isolation.** Every workspace-scoped query flows through
  `getMembership`/`requireWorkspaceRole`. Use `ctx.workspace!.workspaceId`,
  never `ctx.workspace!.id` (that's the membership row id).
- **Idempotent by design.** Executions key on `(provider, providerEventId)`;
  worker steps never re-run completed work.
- **No secrets in logs.** The logger redacts token/secret keys by name.
- **Tests around failure modes.** A feature without a failing-path test will
  be sent back.

## Code signature

1. clarity over cleverness
2. compact functions
3. explicit naming
4. early returns
5. strict typing (`noUncheckedIndexedAccess` is on)
6. schemas at system boundaries
7. domain logic separated from transport/API layers
8. comments explain WHY, not WHAT
9. no meaningless abstractions
10. no giant files when natural boundaries exist
11. predictable error handling (`AppError` hierarchy → HTTP mapping)
12. every external integration goes through an adapter
13. structured logging
14. practical tests around failure modes
15. performance-conscious without premature optimization

## Submitting changes

1. Branch from `main`: `git checkout -b feat/your-change`.
2. Make the change; add or update tests.
3. `npm run lint && npm run typecheck && npm run test && npm run build`.
4. Open a PR with a short description of **what** and **why** (skip the
   what-you-did bullet list; explain the failure mode you're fixing if any).

## Project conventions

- Merged commit style (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- Never commit `.env`, screenshots of secrets, or generated bundles.
- When touching the schema, generate one migration per logical change:
  `npx prisma migrate dev --name describe_the_change --skip-seed`.
- Keep the README feature table honest — no roadmap items presented as done.