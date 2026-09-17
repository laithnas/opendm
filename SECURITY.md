# Security Policy

## Reporting a vulnerability

**Do not open a public issue.** Email security@leonyx-ai.com with:

- affected version / commit
- a minimal repro (steps, payloads, screenshots)
- impact assessment if known

You should receive a reply within 48h. For critical issues (RCE, auth bypass,
token exposure) we will coordinate a release and disclosure window.

## Supported versions

| Version | Supported |
| --- | --- |
| main branch | ✅ |
| tagged releases | ✅ latest only |
| older tags | ❌ |

## Threat model

Leonyx Flow is a self-hosted multi-tenant web app that stores long-lived
social-platform tokens. The highest-value targets are:

1. **Provider tokens at rest** → AES-256-GCM with `ENCRYPTION_KEY`; decrypted only inside the worker/app process; never sent to the browser.
2. **Cross-tenant access (IDOR)** → every workspace-scoped query passes `getMembership`/`requireWorkspaceRole`; workspaces are isolated by row-level `workspaceId` filters.
3. **Inbound webhook spoofing** → `X-Hub-Signature-256` verified with `META_APP_SECRET`; verification failures return 401 and are logged.
4. **Outbound webhook / link destinations (SSRF & open redirects)** → only public http(s) destinations; private/loopback/link-local IPs, credential-bearing URLs, `javascript:`/`data:` schemes rejected.
5. **Session theft** → opaque bearer tokens stored hashed (SHA-256), httpOnly+SameSite=Lax cookies, absolute 30-day expiry.
6. **CSRF** → per-session random token in an httpOnly cookie echoed in the `x-csrf-token` header for every state-changing request.
7. **Replay of events** → executions keyed on `(provider, providerEventId)`; a redelivered webhook is a no-op.
8. **Log leakage** → the structured logger redacts token/secret/password-shaped fields by key name.

## AuthN today

- Magic-link login only (single-use, hashed, 15-minute expiry, rate-limited by IP).
- OAuth (Google) and passwords are roadmap items — do not assume multi-factor
  protection exists yet.

## Hardening checklist for production

```bash
# secrets (32 bytes each)
openssl rand -base64 32   # SESSION_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY
```

- `NODE_ENV=production`, TLS termination, `APP_URL` set to the public origin.
- Keep `DEMO_MODE=false`; disable the test-webhook endpoint in prod
  (it is already gated to development/demo).
- Encrypt `ENCRYPTION_KEY` per-instance; rotating it invalidates stored tokens
  (reconnect accounts afterwards).
- Back up Postgres; keep Redis durable (the compose file uses appendonly).
- Restrict the dashboard to a private network or VPN if you self-host for a
  single team.

## Known limitation

- `DEMO_MODE=true` exposes the demo login and seeded data — never enable it on
  a public production instance.