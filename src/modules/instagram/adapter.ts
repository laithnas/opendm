import { env } from "@/lib/env";
import { ProviderError } from "@/lib/errors";
import { httpFetch } from "@/lib/http";
import { log } from "@/lib/logger";
import type {
  OutboundMessageInput,
  OutboundMessageResult,
  ProviderAccountInfo,
  ProviderComment,
  ProviderCtx,
  ProviderMedia,
  PublicReplyInput,
  PublicReplyResult,
  SocialProvider,
} from "@/modules/providers/types";
import { parseInstagramWebhook } from "@/modules/instagram/webhook";

// Official Meta Graph API client for Instagram. No scraping, no browser
// automation, no passwords — only documented endpoints with user tokens.

// Instagram API with Instagram Login: every call, not just OAuth, goes
// through graph.instagram.com — not graph.facebook.com.
const GRAPH_BASE = "https://graph.instagram.com";

export class InstagramProvider implements SocialProvider {
  kind = "instagram" as const;
  displayName = "Instagram";

  capabilities = {
    ctaButtons: true,
    storyReplies: true,
    commentReplies: true,
    whispers: {
      label: "Messaging window",
      description: "Instagram allows business messages only inside the 7-day messaging window since the user's last message.",
    },
  };

  /** Send a private reply (DM) to a recipient or to a comment author. */
  async sendDm(ctx: ProviderCtx, to: { externalId: string; commentId?: string }, input: OutboundMessageInput): Promise<OutboundMessageResult> {
    const message: Record<string, unknown> = { text: input.text.slice(0, 1000) };
    if (input.quickReplies?.length) {
      message.quick_replies = input.quickReplies.map((qr) => ({
        content_type: "text",
        title: qr.title.slice(0, 36),
        payload: qr.payload || `cta:${qr.title}`.slice(0, 1000),
      }));
    }
    const body = {
      // Comment private reply: recipient is the comment id. Plain user-id
      // recipients only work once the user has messaged the account.
      recipient: to.commentId ? { comment_id: to.commentId } : { id: to.externalId },
      message,
    };
    const res = await graphPost<{ message_id?: string }>(ctx, `${ctx.connection.externalAccountId}/messages`, body);
    return { externalMessageId: res.message_id ?? undefined };
  }

  /** Publish a public reply to a comment (kept inside the comment thread). */
  async sendPublicReply(ctx: ProviderCtx, input: PublicReplyInput): Promise<PublicReplyResult> {
    // Replying to a comment: POST /{comment-id}/replies
    const res = await graphPost<{ id?: string }>(ctx, `${input.commentId}/replies`, { message: input.text.slice(0, 1000) });
    return { externalReplyId: res.id ?? undefined };
  }

  async fetchAccount(ctx: ProviderCtx): Promise<ProviderAccountInfo> {
    // "me" always resolves to the token's own account — works both right
    // after OAuth (no known id yet) and for later health checks. Note the
    // id field is `user_id` here, not `id` (this is Instagram Login's own
    // API, distinct from the Facebook-Page-mediated Instagram Graph API).
    const res = await graphGet<{
      user_id: string;
      username: string;
      name?: string;
      followers_count?: number;
      profile_picture_url?: string;
    }>(ctx, "me", ["user_id", "username", "name", "followers_count", "profile_picture_url"]);
    return {
      externalId: String(res.user_id),
      username: res.username,
      displayName: res.name ?? res.username,
      followersCount: res.followers_count ?? null,
    };
  }

  parseWebhook(payload: unknown) {
    return parseInstagramWebhook(payload);
  }

  async listMedia(ctx: ProviderCtx, opts: { limit: number }): Promise<ProviderMedia[]> {
    const rows = await graphList<{
      id: string;
      caption?: string;
      permalink?: string;
      timestamp?: string;
      comments_count?: number;
    }>(ctx, `${ctx.connection.externalAccountId}/media`, ["id", "caption", "permalink", "timestamp", "comments_count"], opts.limit);
    return rows.map((m) => ({
      id: m.id,
      caption: m.caption ?? null,
      permalink: m.permalink ?? null,
      timestamp: m.timestamp ?? null,
      commentsCount: m.comments_count ?? null,
    }));
  }

  async listComments(ctx: ProviderCtx, mediaId: string, opts: { limit: number }): Promise<ProviderComment[]> {
    const owner = ctx.connection.username?.toLowerCase() ?? "";
    const rows = await graphList<{
      id: string;
      text?: string;
      username?: string;
      timestamp?: string;
      from?: { id?: string; username?: string };
      replies?: { data?: { id: string; username?: string; from?: { id?: string } }[] };
    }>(ctx, `${mediaId}/comments`, ["id", "text", "username", "timestamp", "from", "replies{id,username,from}"], opts.limit);
    return rows.map((c) => ({
      id: c.id,
      text: c.text ?? "",
      username: c.username ?? c.from?.username,
      fromId: c.from?.id,
      timestamp: c.timestamp ?? null,
      repliedByOwner: (c.replies?.data ?? []).some(
        (r) => (owner && r.username?.toLowerCase() === owner) || r.from?.id === ctx.connection.externalAccountId,
      ),
    }));
  }
}

// ── Transport helpers ─────────────────────────────────────────────────────

interface GraphErrorBody {
  error?: { code?: number; error_subcode?: number; message?: string; type?: string; fbtrace_id?: string };
}

function toProviderError(status: number, body: string): ProviderError {
  let parsed: GraphErrorBody = {};
  try {
    parsed = JSON.parse(body) as GraphErrorBody;
  } catch {
    // non-JSON error body
  }
  const e = parsed.error;
  const message = e?.message ?? `Meta API error (${status})`;
  const code = e?.code ? String(e.code) : String(status);
  log.warn("meta api error", { status, code, message, fbtrace: e?.fbtrace_id });
  return new ProviderError(message, code);
}

async function graphGet<T>(ctx: ProviderCtx, path: string, fields: string[]): Promise<T> {
  const url = `${GRAPH_BASE}/${ctx.apiVersion}/${path}?fields=${fields.join(",")}&access_token=${encodeURIComponent(ctx.accessToken)}`;
  const res = await httpFetch(url, { method: "GET" }, { timeoutMs: 15000 });
  return handleGraphResponse<T>(res.status, res.body, url);
}

/** GET a paged edge, following `paging.next` until `limit` rows are collected. */
async function graphList<T>(ctx: ProviderCtx, path: string, fields: string[], limit: number): Promise<T[]> {
  const out: T[] = [];
  let url: string | null =
    `${GRAPH_BASE}/${ctx.apiVersion}/${path}?fields=${fields.join(",")}&limit=${Math.min(limit, 50)}&access_token=${encodeURIComponent(ctx.accessToken)}`;
  while (url && out.length < limit) {
    const res = await httpFetch(url, { method: "GET" }, { timeoutMs: 15000 });
    const page: { data?: T[]; paging?: { next?: string } } = handleGraphResponse(res.status, res.body, url);
    out.push(...(page.data ?? []));
    url = page.paging?.next ?? null;
  }
  return out.slice(0, limit);
}

async function graphPost<T>(ctx: ProviderCtx, path: string, body: unknown): Promise<T> {
  // POST with access_token in body keeps the token out of server logs and
  // proxies when the request is logged raw. Use query param to keep it
  // simple but never log the URL.
  const url = `${GRAPH_BASE}/${ctx.apiVersion}/${path}`;
  const res = await httpFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(body as Record<string, unknown>), access_token: ctx.accessToken }),
    },
    { timeoutMs: 15000 },
  );
  return handleGraphResponse<T>(res.status, res.body, url);
}

function handleGraphResponse<T>(status: number, body: string, /* url */ _url: string): T {
  if (status >= 400) throw toProviderError(status, body);
  return JSON.parse(body) as T;
}

/** Resolve the app secret for signature verification. */
export function metaAppSecret(): string {
  return env.META_APP_SECRET;
}