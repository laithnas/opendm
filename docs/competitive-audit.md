# Competitive audit: OpenReply (reference) vs OpenDM

Internal audit written while studying <https://github.com/diwenne/openreply> as
reference material. OpenReply is a competent single-purpose Instagram
comment→DM tool; OpenDM is architected as a general automation engine.
Nothing here copied — concepts reimplemented independently.

## What OpenReply does well

- Single, clear mental model (comment → DM) with a flat, approachable schema.
- Webhook + polling reconciliation with dedupe guards; owner-reply detection.
- Follower snapshots to retain Instagram insights beyond Meta's 30-day window.
- Operational events surface worker/health issues.
- Simple deployment (Next.js + one tsx worker).

## Where it feels incomplete (for the brief)

- No contacts/CRM, conversations/inbox, or per-contact history — the payload
  is a DM log, not a customer record.
- No execution/step model: DmLog rows record the send, but there's no
  observable pipeline (conditions, per-action retries, durations).
- Analytics = link clicks only; no funnel, keywords, date windows, queue or
  account health.
- Flat boolean rows (`dmTriggerEnabled`, `requireFollow`, `followUpEnabled`…)
  hardcode one workflow shape; adding a feature = schema migration.
- No templates, no export/import, no webhook ACTION, no AI, no queue
  monitoring UI, no roles enforcement surfaced in UI, tokens stored
  plaintext in the reference schema.

## Architectural limitations in the reference (scale/pain points)

- Flat config table: every new capability is a migration; per-install
  divergence inevitable.
- DmLog grows unbounded with no retention story; no job-level tracing.
- Single worker file couples all concerns; no dead-letter observability.
- Webhook + polling overlap needs continuous reconciliation effort.
- Plaintext access tokens at rest (encryption is a stated differentiator
  here).

## Where the new implementation is meaningfully better

| Capability | OpenReply | OpenDM |
| --- | --- | --- |
| Automation model | hardcoded comment→DM booleans | trigger → conditions → actions, first-class delay/branch |
| Observability | dm log + operational events | executions + steps + retries + errors + durations |
| CRM | none | contacts, tags, notes, timeline |
| Inbox | none | conversations, messages, window enforcement |
| Analytics | click counts | funnel, keywords, top automations, health, date filters |
| Extensibility | schema gymnastics | registered trigger/action/condition kinds + provider interface |
| Portability | none | versioned JSON export/import |
| Integrations out | none | signed webhook action (n8n/Make/Zapier/CRM) |
| AI | none | provider abstraction, approval-gated drafts |
| Security posture | plaintext tokens | AES-256-GCM at rest, HMAC verification, CSRF, SSRF guards |

## UX friction observed in the reference (design inputs only)

- Campaign builder is form-heavy; a visual flow is easier to read in seconds.
- No demo/seeded state → cannot evaluate without credentials.
- Messaging-window and API restrictions aren't surfaced pre-send.

These observations shaped the builder, demo mode, and window enforcement in
OpenDM.