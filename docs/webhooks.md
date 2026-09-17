# Webhooks

Two kinds of webhooks exist in the product: **inbound** (Meta/Instagram →
us) and **outbound** (us → your stack: n8n, Make, Zapier, custom CRM).

## Inbound: Instagram

- **Endpoint:** `POST /api/webhooks/instagram`
- **Verification:** `X-Hub-Signature-256` = `sha256=<HMAC-SHA256(rawBody, META_APP_SECRET)>`. Mismatched or missing signatures → 401, logged with IP.
- **Behavior:** parse → enqueue `ingest` → return `200 OK` immediately. All processing happens in the worker.
- **Subscription:** GET verification echoes `hub.challenge` when `hub.mode=subscribe` and the verify token matches.
- **Idempotency:** executions keyed `(provider, providerEventId)` — redeliveries are dropped silently.
- **Dev/testing:** `POST /api/webhooks/test` (development or `DEMO_MODE` only) simulates events against the mock provider with the real queue path. Meta envelope fixtures live in the Instagram webhook parser tests.

## Outbound: automation `CALL_WEBHOOK`

When an automation action calls a webhook, the worker creates a
`WebhookDelivery` row and enqueues a delivery job.

**Request:**

```
POST {url}
Content-Type: application/json
X-Leonyx-Event: execution.completed
X-Leonyx-Idempotency-Key: <deliveryId>
X-Leonyx-Signature: sha256=<HMAC-SHA256(canonicalBody, secret)>   # when a secret is configured
```

**Body (default):**

```json
{
  "event": "leonyx.execution.completed",
  "executionId": "…",
  "automationId": "…",
  "triggerType": "COMMENT",
  "triggerText": "GUIDE",
  "contactId": "…",
  "contactUsername": "mike",
  "sentAt": "2026-09-17T12:00:00.000Z"
}
```

With a `payloadTemplate`, the body becomes `{ ...structured, body: <rendered
template> }` so `{{username}}`/`{{comment}}` work inside custom payloads.

**Delivery semantics:**

- Timeout 10s, response body capped at 256KB.
- Retries: 5 attempts, exponential backoff (5s → 60s cap).
- Statuses: `PENDING → DELIVERED | FAILED`, with `attempts`,
  `responseStatus`, `responseBody`, `lastError`, `nextAttemptAt`.
- Secrets are stored AES-256-GCM encrypted, never logged, never rendered to
  the browser (delivery list shows URL + status only).

**Why HMAC:** receivers can verify authenticity with the shared secret:

```js
const crypto = require("crypto");
function valid(req, secret) {
  const sig = req.headers["x-leonyx-signature"];          // sha256=…
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
```

## SSRF / abuse protection

Outbound URLs pass `validateDestination()`: http(s) only, public hosts only
(private/loopback/link-local IPs, `localhost`, credential-bearing URLs, IPv6
literals rejected). Same validator guards tracked-link destinations.