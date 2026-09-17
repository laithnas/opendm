# Automation engine reference

## Concept

```
TRIGGER ──► CONDITIONS ──► ACTIONS ──► (delay) ──► NEXT ACTION
```

An automation is: one trigger, zero+ conditions (all must pass), and an
ordered action list (with per-action delays). Execution is idempotent,
observable, and fully event-driven — the engine never polls.

## Triggers

| Trigger | Normalized kind | Source |
| --- | --- | --- |
| Instagram comment | `COMMENT` | webhook `comments` field |
| Instagram DM | `DM` | webhook `messaging` field |
| Story reply | `STORY_REPLY` | webhook `messaging` field with `post` payload |

Future triggers (Facebook post comment, WhatsApp message, TikTok mention…)
implement the same `NormalizedEvent` shape.

## Conditions

Evaluated in order; **all must pass** or the run is recorded as `SKIPPED`
with the failing condition's reason.

| Kind | Config | Semantics |
| --- | --- | --- |
| `KEYWORD_MATCH` | `keywords[]`, `matchAny`, `caseInsensitive`, `wholeWord` | text contains keyword(s) — returns the matched keyword for analytics + `{{keyword}}` |
| `EXCLUDE_KEYWORDS` | `keywords[]` | skips when an excluded keyword is present |
| `POST_MATCH` | `postSelection: any\|specific`, `postRef` | comment must be on the chosen media id |
| `FOLLOWERS_ONLY` | `requireFollow` | commenter must follow; fails closed when follower status is unavailable (no advanced access) |
| `ALL` | — | always true (identity condition) |

Legacy single-config automations (imports from v1 payloads) can still carry
keywords directly in `triggerConfig` — evaluated alongside the condition rows.

## Actions

| Kind | Config | Notes |
| --- | --- | --- |
| `SEND_DM` | `text`, `ctaButtons[]` (≤3) | messaging-window checked at send time |
| `SEND_LINK` | `text`, `linkSlug` or `linkDestination`+`linkName` | tracked link resolved at execution; `{{link}}` renders the short URL |
| `PUBLIC_REPLY` | `text` | replies to the comment thread |
| `ADD_TAG` | `tag` | creates tag if missing, links it to the contact |
| `CALL_WEBHOOK` | `url`, `secret?`, `payloadTemplate?` | schedules a signed delivery (see webhooks.md) |
| `DELAY` | `ms` | first-class wait — the next job is scheduled with BullMQ delay |

Every action has `enabled`, `order`, and `delayMs`. Disabled actions are
snapshot-skipped but remain visible in the builder.

## Variables

Rendered into message templates at execution time (snapshot — later config
edits don't rewrite history):

| Variable | Value |
| --- | --- |
| `{{username}}` | commenter/sender handle |
| `{{name}}` | display name when the provider supplies it |
| `{{comment}}` | the triggering text |
| `{{keyword}}` | matched keyword (when one matched) |
| `{{link}}` | tracked link URL (SEND_LINK actions) |
| `{{workspace}}` | workspace name |

## Statuses

Execution: `QUEUED → RUNNING → COMPLETED | PARTIALLY_COMPLETED | FAILED | SKIPPED`

- `SKIPPED` means conditions failed (or no actions ran) — observable, never re-driven.
- `PARTIALLY_COMPLETED` = some actions succeeded, some failed.
- Steps: `PENDING → RUNNING → COMPLETED | FAILED | SKIPPED` with `attempts`, `error`, `startedAt/completedAt`.

## Message template rules & limits

- Provider text cap: 1000 chars (sliced at the snapshot boundary).
- CTA buttons: 3 max, 36-char titles.
- Default messaging window: 168 hours (7 days) from the user's last inbound
  message — change `MESSAGING_WINDOW_HOURS` in `src/config.ts`.

## Export / import schema

Portable JSON, versioned:

```json
{
  "schema": "leonyx.flow.automation",
  "schemaVersion": 1,
  "exportedAt": "2026-09-17T…",
  "automation": {
    "name": "Comment GUIDE",
    "description": null,
    "triggerType": "COMMENT",
    "triggerConfig": {},
    "conditions": [{ "kind": "KEYWORD_MATCH", "config": {…}, "order": 0, "enabled": true }],
    "actions": [{ "kind": "PUBLIC_REPLY", "config": {…}, "order": 0, "enabled": true, "delayMs": 0 }]
  }
}
```

Import is strict (`zod .strict()`): unknown keys are rejected. `SEND_LINK`
actions import portably — a `linkDestination` yields a fresh tracked link in
the importing workspace; a bare `linkSlug` only works when the slug already
exists there (otherwise the import fails with a clear message).

## Extending the engine

1. New **action** kind: add `ActionKind` enum + migration, a case in
   `snapshotActionPayload`, a case in the worker's `processActionJob`,
   an entry in `ACTION_TYPES` (builder) + `actionLabelAndPreview` (flow view), and a test.
2. New **condition** kind: `ConditionKind` enum, a case in
   `evaluateSingleCondition`, builder `CONDITION_TYPES`, and tests.
3. New **trigger**: `TriggerType` enum, normalize in the provider's
   `parseWebhook`, engine looks automations up by `triggerType` automatically.
4. New **provider**: implement `SocialProvider`, register it, document it as a
   roadmap item until real — the engine is provider-agnostic.