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
    media_id: string;
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
      attachments?: unknown[];
    };
    post?: { id?: string; text?: string; media?: unknown[]; author?: { id?: string; username?: string } };
  };
}

type IgChange = IgCommentChange | IgMessagingChange;

export function parseInstagramWebhook(payload: unknown): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  if (!payload || typeof payload !== "object") return events;
  const root = payload as {
    entry?: { id?: string; time?: number; changes?: IgChange[] }[];
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
    }
  }
  return events.filter((e): e is NormalizedEvent => Boolean(e));
}

function normalizeComment(v: IgCommentChange["value"]): NormalizedEvent | null {
  if (!v?.id || !v.media_id) return null;
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
    mediaId: v.media_id,
    commentId: v.id,
    occurredAt: v.timestamp ? new Date(v.timestamp * 1000).toISOString() : new Date().toISOString(),
    raw: v,
  };
}

function normalizeMessaging(v: IgMessagingChange["value"]): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  const occurredAt = v.timestamp ? new Date(v.timestamp * 1000).toISOString() : new Date().toISOString();
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

  // DM: message object present.
  if (v.message && v.message.mid && sender) {
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
      occurredAt,
      raw: v,
    });
  }
  return out;
}