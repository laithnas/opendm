import type { NormalizedEvent } from "@/modules/providers/types";

// Instagram webhook payload → normalized engine events.
//
// Supported change fields:
//   - "comments"   → COMMENT events (media comments)
//   - "messaging"  → DM / story-reply events in the unified messaging stream
//
// Story replies arrive inside "messaging" changes as a `post` object
// (story post with text). We normalize both so the STORY_REPLY trigger works
// without special-casing in the engine.

interface IgCommentChange {
  field: "comments";
  value: {
    id: string;
    // Real Instagram Login webhook deliveries nest this as
    // `media: { id, media_product_type }`, not a flat `media_id` string
    // (confirmed against a live payload — the flat field doesn't exist).
    // Kept both so an older/alternate payload shape still works.
    media?: { id?: string; media_product_type?: string };
    media_id?: string;
    text?: string;
    username?: string;
    timestamp?: number;
    from?: { id: string; username?: string };
    parent_id?: string;
  };
}

interface IgMessagingChange {
  field: "messaging";
  value: {
    sender?: { id: string; username?: string; name?: string };
    recipient?: { id: string };
    timestamp?: number;
    message?: {
      mid?: string;
      text?: string;
      is_deleted?: boolean;
      is_unsupported?: boolean;
      is_echo?: boolean;
      attachments?: unknown[];
      // Present when the message is a tap on one of our quick-reply buttons.
      quick_reply?: { payload?: string };
    };
    post?: { id?: string; text?: string; media?: unknown[]; author?: { id?: string; username?: string } };
    // A tap on a button-template button (see adapter.ts sendDm) arrives as
    // this separate top-level field, NOT nested under `message` at all —
    // there is no `message.mid` on a postback event.
    postback?: { payload?: string; title?: string; mid?: string };
  };
}

type IgChange = IgCommentChange | IgMessagingChange;

export function parseInstagramWebhook(payload: unknown): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  if (!payload || typeof payload !== "object") return events;
  const root = payload as {
    entry?: {
      id?: string;
      time?: number;
      changes?: IgChange[];
      // Real Instagram Login webhook deliveries send messaging events as a
      // top-level array sibling to `changes`, not wrapped inside a
      // {field:"messaging", value} change (confirmed against a live
      // payload — a delivery with only this key was parsing to 0 events).
      // Comments still arrive via `changes`; this is messaging-only.
      messaging?: IgMessagingChange["value"][];
    }[];
    object?: string;
  };
  if (root.object === "instagram") {
    for (const entry of root.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field === "comments") {
          const ev = normalizeComment(change.value);
          if (ev) events.push(ev);
        } else if (change.field === "messaging") {
          events.push(...normalizeMessaging(change.value));
        }
      }
      for (const value of entry.messaging ?? []) {
        events.push(...normalizeMessaging(value));
      }
    }
  }
  return events.filter((e): e is NormalizedEvent => Boolean(e));
}

function normalizeComment(v: IgCommentChange["value"]): NormalizedEvent | null {
  const mediaId = v?.media_id ?? v?.media?.id;
  if (!v?.id || !mediaId) return null;
  return {
    provider: "instagram",
    kind: "COMMENT",
    providerEventId: v.id,
    text: v.text ?? "",
    contact: {
      externalId: v.from?.id ?? v.id,
      username: v.from?.username ?? v.username,
      name: undefined,
    },
    mediaId,
    commentId: v.id,
    occurredAt: v.timestamp ? new Date(v.timestamp * 1000).toISOString() : new Date().toISOString(),
    raw: v,
  };
}

function normalizeMessaging(v: IgMessagingChange["value"]): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  // Messaging timestamps are already epoch-milliseconds (confirmed against a
  // live payload — a 13-digit value, unlike comments' 10-digit seconds).
  // Multiplying by 1000 again lands the Date in the year ~58698 and crashes
  // any DB write that touches it. This broke every real DM event, including
  // every follow-gate button tap.
  const occurredAt = v.timestamp ? new Date(v.timestamp).toISOString() : new Date().toISOString();
  const sender = v.sender;

  // Story reply: `post` object present.
  if (v.post && v.post.id && sender) {
    out.push({
      provider: "instagram",
      kind: "STORY_REPLY",
      providerEventId: `story:${v.post.id}:${sender.id}`,
      text: v.post.text ?? "",
      contact: {
        externalId: sender.id,
        username: sender.username,
        name: sender.name,
      },
      commentId: null,
      conversationExternalId: v.post.id,
      occurredAt,
      raw: v,
    });
  }

  // DM: message object present. `is_echo` means it's a message OUR account
  // sent, delivered back to us by Meta — not an inbound event to act on.
  if (v.message && v.message.mid && sender && !v.message.is_echo) {
    if (v.message.is_deleted) return out;
    out.push({
      provider: "instagram",
      kind: "DM",
      providerEventId: v.message.mid,
      text: v.message.text ?? "",
      contact: {
        externalId: sender.id,
        username: sender.username,
        name: sender.name,
      },
      conversationExternalId: v.message.mid,
      buttonPayload: v.message.quick_reply?.payload ?? null,
      occurredAt,
      raw: v,
    });
  }

  // Button-template tap: no `message` object at all, just this field.
  if (v.postback && sender) {
    out.push({
      provider: "instagram",
      kind: "DM",
      providerEventId: v.postback.mid ?? `postback:${sender.id}:${v.timestamp ?? Date.now()}`,
      text: v.postback.title ?? "",
      contact: {
        externalId: sender.id,
        username: sender.username,
        name: sender.name,
      },
      conversationExternalId: v.postback.mid ?? null,
      buttonPayload: v.postback.payload ?? null,
      occurredAt,
      raw: v,
    });
  }
  return out;
}