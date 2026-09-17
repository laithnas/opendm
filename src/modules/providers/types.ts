import type { SocialConnection } from "@prisma/client";

// Provider abstraction. The whole product speaks to social platforms through
// this interface; Instagram is the v1 implementation. Adding Facebook,
// TikTok, LinkedIn, WhatsApp or X later means implementing this interface,
// registering it in the registry and documenting the roadmap — no engine
// changes required.

export type ProviderKind = "instagram" | "facebook" | "tiktok" | "linkedin" | "x" | "whatsapp";

export interface ProviderAccountInfo {
  externalId: string;
  username: string;
  displayName?: string | null;
  followersCount?: number | null;
}

export interface OutboundMessageInput {
  text: string;
  quickReplies?: { title: string; payload: string }[];
}

export interface OutboundMessageResult {
  externalMessageId?: string;
}

export interface PublicReplyInput {
  mediaId: string;
  commentId: string;
  text: string;
}

export interface PublicReplyResult {
  externalReplyId?: string;
}

/** Context handed to every provider call: a connection + live token. */
export interface ProviderCtx {
  connection: SocialConnection;
  accessToken: string;
  apiVersion: string;
}

/** One normalized social event understood by the engine. */
export interface NormalizedEvent {
  provider: ProviderKind;
  kind: "COMMENT" | "DM" | "STORY_REPLY";
  /** Provider event id used for idempotency (comment id, message mid, …). */
  providerEventId: string;
  text: string;
  contact: { externalId: string; username?: string; name?: string };
  /** Media id for comment events. */
  mediaId?: string | null;
  commentId?: string | null;
  conversationExternalId?: string | null;
  occurredAt: string;
  raw: unknown;
}

export interface SocialProvider {
  kind: ProviderKind;
  displayName: string;
  sendDm(ctx: ProviderCtx, to: { externalId: string }, input: OutboundMessageInput): Promise<OutboundMessageResult>;
  sendPublicReply(ctx: ProviderCtx, input: PublicReplyInput): Promise<PublicReplyResult>;
  fetchAccount(ctx: ProviderCtx): Promise<ProviderAccountInfo>;
  parseWebhook(payload: unknown): NormalizedEvent[];
  capabilities: {
    ctaButtons: boolean;
    storyReplies: boolean;
    /** Public comment replies require media+comment context only. */
    commentReplies: boolean;
    whispers: { label: string; description: string };
  };
}