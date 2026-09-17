# Security

Implementation notes for the threat model in SECURITY.md. This document maps
each threat to the concrete control in code.

## Webhook spoofing (inbound)

- `src/app/api/webhooks/instagram/route.ts` — GET verification echoes
  `hub.challenge` only when `hub.mode=subscribe` and the token equals
  `META_VERIFY_TOKEN`. POST bodies are verified with
  `verifyHubSignature(appSecret, rawBody, x-hub-signature-256)` using
  `timingSafeEqual`; failures return 401 and log `signaturePresent` + IP.
- Replay: executions are unique on `(provider, providerEventId)` — a
  replayed event is a no-op (constraint-backed, not just a code check).

## CSRF

- `src/lib/security.ts` — a random token is set as an httpOnly cookie
  (`csrf`) and also returned by `/api/auth/me`; every state-changing request
  must echo it in `x-csrf-token`. `apiRoute()` enforces this for all
  non-GET routes with a body. SameSite=Lax on the session cookie is the
  second layer.

## XSS

- React escapes by default; the app renders provider text as text (never
  `dangerouslySetInnerHTML`). Links in the UI are rendered as plain text or
  `href` with `noreferrer`. A future rich-text surface must keep this rule.

## SQL injection

- Prisma parameterizes all queries; the only raw SQL is
  `$queryRaw`/`$executeRawUnsafe` in analytics with template parameters or a
  `tableNames` allowlist built from `pg_tables` (test helper).

## SSRF / unsafe destinations

- `validateDestination()` (links + outbound webhooks): http(s) only,
  rejects localhost, `.localhost`, private/reserved IPv4 ranges (10/8,
  127/8, 169.254/16, 172.16/12, 192.168/16, 0/8, ≥224/4), IPv6 literals,
  and embedded credentials.
- Outbound webhook deliveries are signed and have a 10s timeout and body cap.

## Open redirects

- `safeRedirect()` only allows same-origin targets; magic-link `next` params
  are sanitized through it.

## Broken access control / workspace IDOR

- `apiRoute({ workspace: true })` resolves the workspace from the
  `x-workspace-id` header **and** verifies membership via
  `getMembership(userId, workspaceId)` on every request.
- Services scoped by workspace always receive the *resolved* workspace id
  (`ctx.workspace!.workspaceId`) — never a client-chosen id alone.
- Legacy pitfall: `WorkspaceContext.id` is the membership row id; code must
  use `.workspaceId` (documented in AGENTS.md).
- Role gates (`OWNER/ADMIN/MEMBER`) are enforced in the route layer via
  `roles:` on `apiRoute`.

## Secrets at rest & in transit

- Provider tokens: AES-256-GCM with `ENCRYPTION_KEY` → `encryptSecret()`;
  stored in `accessTokenEnc`/`refreshTokenEnc`; decrypted only in worker/app
  process memory for a single API call.
- Session tokens: only SHA-256 hashes stored; raw token lives in an httpOnly
  cookie.
- Magic-link tokens: hashed, single-use, 15-minute expiry.
- Logs: `redact()` drops token/secret/password/apiKey/authorization/cookie/
  session-shaped top-level fields. Webhook URLs are logged, bodies are not.

## Brute force

- Magic-link issuance is rate-limited per IP (`5/min`); sessions are opaque
  random 256-bit values (no forgery surface).

## Replay of outbound deliveries

- `X-Leonyx-Idempotency-Key` header = delivery id; receivers can dedupe.

## Data minimization

- Contacts store only provider-supplied identifiers/username/name; email and
  phone are stored only when explicitly added by the user. IPs are hashed
  before storage (`hashIp`). No raw IPs are persisted.

## Dependency posture

- Zero runtime SDKs for AI/providers — REST calls through a bounded HTTP
  client (timeouts, caps). Auth is first-party (no next-auth beta surface).
  BullMQ/Prisma/Next are pinned and patched (see CHANGELOG for the next
  14.2.x security backport).

## Security testing

- Unit: HMAC + hub-signature verification, CSRF pairing, destination
  validation, safeRedirect, window logic.
- Integration: workspace isolation, invite/role enforcement, import
  validation, click dedupe.
- A live webhook-smoke test (signature path) is exercised in the demo flow
  via the test endpoint; real-signature verification happens with Meta
  credentials and is covered by the same primitives.