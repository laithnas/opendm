# Changelog

All notable changes to this project are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/); versioning follows
[SemVer](https://semver.org/).

## [Unreleased]

### Added

- **Automation engine** — event → conditions → actions pipeline with idempotent,
  observable executions (per-step status, retries, errors, durations).
- **Visual automation builder** — Trigger → Conditions → Actions with inline
  editors, reordering, enable/disable, dry-run tests, AI draft generation.
- **Auth** — magic-link login (single-use, rate-limited), hashed sessions,
  CSRF pairing, demo-mode login, onboarding flow.
- **Workspaces** — owner/admin/member roles, invites with acceptance flow,
  audit log, workspace switcher.
- **Social provider layer** — `SocialProvider` interface, Instagram adapter
  (official Meta Graph API: DMs, comment replies, account info, webhook
  parsing), mock provider for demo/tests, registry with roadmap providers.
- **Mini-CRM** — contacts, tags, notes, engagement timeline, source tracking.
- **Unified inbox** — conversations for DMs/story replies, unread state,
  messaging-window enforcement with clear blocking reasons, manual replies.
- **Tracked links** — non-guessable slugs, clicks + unique clicks, destination
  validation against open-redirect/SSRF abuse.
- **Analytics** — dashboard with triggers, DMs sent/failed, clicks, CTR, top
  automations, top keywords, conversion funnel, account health; date filters.
- **AI features** — provider abstraction (Anthropic/OpenAI/Gemini), message
  rewrite, campaign generation, suggestions, insight summaries; usage ledger;
  approval-gated by design.
- **Automation templates** — 10 starter flows instantiated as editable drafts.
- **Export/import** — versioned portable JSON (`leonyx.flow.automation` v1),
  strict validation, link re-wiring across instances.
- **Outbound webhooks** — HMAC-SHA256 signed deliveries with retries, timeout,
  persisted delivery log and failure state; n8n/Make/Zapier-friendly payloads.
- **Queue system** — BullMQ (ingest/execute/actions/webhooks) with per-account
  rate limiting, exponential backoff, dead-letter retention, worker heartbeat.
- **Demo mode** — seeded workspace (campaigns, contacts, executions, inbox,
  clicks) behind one-click demo login.
- **Tests** — Vitest unit + integration suite (65 tests).
- **Docs** — architecture, setup, deployment, Meta setup, automation engine,
  webhooks, security, troubleshooting, launch materials.

### Security

- Provider tokens encrypted at rest (AES-256-GCM).
- Meta webhook signature verification (`X-Hub-Signature-256`).
- SSRF-safe destination validation (private IPs, localhost, credentials,
  non-http schemes blocked).
- Session tokens hashed at rest; workspace isolation enforced server-side.

## [0.1.0] - 2026-09-17

Initial public release of the platform core (all of “Unreleased” above.).