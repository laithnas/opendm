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

/** A published post (feed post, reel, carousel) of the connected account. */
export interface ProviderMedia {
  id: string;
  caption?: string | null;
  permalink?: string | null;
  timestamp?: string | null;
  commentsCount?: number | null;
}

/** A top-level comment on a post, with whether the account already answered. */
export interface ProviderComment {
  id: string;
  text: string;
  username?: string;
  fromId?: string;
  timestamp?: string | null;
  /** True when the connected account already replied publicly. */
  repliedByOwner: boolean;
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
  // Registry identity — broader than ProviderKind so a provider can register
  // a variant (e.g. a mock adapter) without colliding with the real one.
  // Events it produces still carry a real ProviderKind (see NormalizedEvent).
  kind: ProviderKind | (string & {});
  displayName: string;
  /**
   * `commentId` sends a comment private reply (allowed once per comment, within
   * 7 days of it being posted) — the only way to DM someone who never messaged
   * the account first.
   */
  sendDm(ctx: ProviderCtx, to: { externalId: string; commentId?: string }, input: OutboundMessageInput): Promise<OutboundMessageResult>;
  sendPublicReply(ctx: ProviderCtx, input: PublicReplyInput): Promise<PublicReplyResult>;
  fetchAccount(ctx: ProviderCtx): Promise<ProviderAccountInfo>;
  parseWebhook(payload: unknown): NormalizedEvent[];
  /** Optional: enumerate recent posts (used to backfill existing comments). */
  listMedia?(ctx: ProviderCtx, opts: { limit: number }): Promise<ProviderMedia[]>;
  /** Optional: enumerate top-level comments of one post. */
  listComments?(ctx: ProviderCtx, mediaId: string, opts: { limit: number }): Promise<ProviderComment[]>;
  /**
   * Optional: subscribe this specific connected account to the app's
   * webhooks. Configuring the app-level webhook (callback URL + fields) is
   * necessary but NOT sufficient — each connected account must separately
   * opt in, or Meta never delivers events for it even though the app-level
   * config looks correct. Call after every successful connect.
   */
  subscribeToWebhooks?(ctx: ProviderCtx): Promise<{ subscribed: string[] }>;
  /** Optional: non-secret check of current subscription status. */
  getWebhookSubscriptionStatus?(ctx: ProviderCtx): Promise<{ subscribed: boolean; raw: unknown }>;
  capabilities: {
    ctaButtons: boolean;
    storyReplies: boolean;
    /** Public comment replies require media+comment context only. */
    commentReplies: boolean;
    whispers: { label: string; description: string };
  };
}