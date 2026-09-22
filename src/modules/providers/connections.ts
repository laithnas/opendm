import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { AppError, NotFoundError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { httpFetch } from "@/lib/http";
import { randomCode } from "@/lib/ids";

// Social connection lifecycle: connect (OAuth), health checks, token
// refresh, revoke. Tokens are AES-GCM encrypted at rest, decrypted only
// inside the worker when calling the provider.

export interface ConnectInstagramInput {
  workspaceId: string;
  userId: string;
  externalAccountId: string;
  username: string;
  displayName?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  meta?: Record<string, unknown>;
}

export async function connectInstagram(input: ConnectInstagramInput) {
  const connection = await prisma.socialConnection.upsert({
    where: { provider_externalAccountId: { provider: "INSTAGRAM", externalAccountId: input.externalAccountId } },
    create: {
      workspaceId: input.workspaceId,
      connectedByUserId: input.userId,
      provider: "INSTAGRAM",
      externalAccountId: input.externalAccountId,
      username: input.username,
      displayName: input.displayName ?? input.username,
      accessTokenEnc: encryptSecret(input.accessToken),
      refreshTokenEnc: input.refreshToken ? encryptSecret(input.refreshToken) : null,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      status: "ACTIVE",
      meta: (input.meta ?? {}) as Prisma.InputJsonValue,
    },
    update: {
      workspaceId: input.workspaceId,
      connectedByUserId: input.userId,
      username: input.username,
      displayName: input.displayName ?? input.username,
      accessTokenEnc: encryptSecret(input.accessToken),
      refreshTokenEnc: input.refreshToken ? encryptSecret(input.refreshToken) : null,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      status: "ACTIVE",
      lastError: null,
      meta: (input.meta ?? {}) as Prisma.InputJsonValue,
    },
  });
  log.info("instagram connected", { workspaceId: input.workspaceId, accountId: input.externalAccountId });
  return connection;
}

/** Demo-mode connection (no Meta credentials required). */
export async function connectDemoInstagram(workspaceId: string, userId: string) {
  return connectInstagram({
    workspaceId,
    userId,
    externalAccountId: "demo-ig-account",
    username: "the.barbershop.demo",
    displayName: "The Demo Studio",
    accessToken: "demo-token",
    tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    meta: { demo: true },
  });
}

export async function listConnections(workspaceId: string) {
  return prisma.socialConnection.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getConnection(workspaceId: string, connectionId: string) {
  const connection = await prisma.socialConnection.findFirst({ where: { id: connectionId, workspaceId } });
  if (!connection) throw new NotFoundError("Connection not found");
  return connection;
}

export async function revokeConnection(workspaceId: string, connectionId: string) {
  // Hard revoke: mark and drop tokens. Automations keep running state but
  // their sends will fail cleanly with "no connected account".
  await prisma.socialConnection.updateMany({
    where: { id: connectionId, workspaceId },
    data: { status: "REVOKED", accessTokenEnc: "", refreshTokenEnc: null },
  });
}

/**
 * Health check: call the provider with the stored token. A working token
 * keeps ACTIVE; failures flip to ERROR with a readable reason.
 */
export async function checkConnectionHealth(workspaceId: string, connectionId: string) {
  const connection = await getConnection(workspaceId, connectionId);
  const { getSocialProvider } = await import("@/modules/providers/registry");
  const provider = getSocialProvider(connection.provider.toLowerCase());
  try {
    const token = connection.accessTokenEnc ? decryptSecret(connection.accessTokenEnc) : null;
    if (!token) throw new Error("token missing");
    await provider.fetchAccount({
      connection,
      accessToken: token,
      apiVersion: env.META_GRAPH_VERSION,
    });
    await prisma.socialConnection.update({
      where: { id: connection.id },
      data: { status: "ACTIVE", lastError: null, lastCheckedAt: new Date() },
    });
    return { ok: true, status: "ACTIVE" as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const looksExpired = /token|expired|session/i.test(message) && /expired|invalid|revoked|reauth/i.test(message);
    await prisma.socialConnection.update({
      where: { id: connection.id },
      data: {
        status: looksExpired ? "EXPIRED" : "ERROR",
        lastError: message.slice(0, 500),
        lastCheckedAt: new Date(),
      },
    });
    return { ok: false, status: (looksExpired ? "EXPIRED" : "ERROR") as "EXPIRED" | "ERROR", error: message };
  }
}

/** Proactive refresh for Instagram long-lived tokens (60 days). */
export async function refreshTokenIfNeeded(workspaceId: string, connectionId: string) {
  const connection = await getConnection(workspaceId, connectionId);
  if (!connection.accessTokenEnc) return { refreshed: false, reason: "no token stored" };
  const current = decryptSecret(connection.accessTokenEnc);
  try {
    // Instagram long-lived tokens refresh themselves — no separate refresh
    // token or app credentials involved, just the current token as auth.
    const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(current)}`;
    const res = await httpFetch(url, { method: "GET" }, { timeoutMs: 15000 });
    if (!res.ok) throw new AppError(`Token refresh failed: ${res.status}`, 502, "TOKEN_REFRESH_FAILED");
    const data = JSON.parse(res.body) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new AppError("Token refresh returned no token", 502, "TOKEN_REFRESH_FAILED");
    await prisma.socialConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenEnc: encryptSecret(data.access_token),
        status: "ACTIVE",
        lastError: null,
        tokenExpiresAt: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : null,
      },
    });
    return { refreshed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.socialConnection.update({
      where: { id: connection.id },
      data: { status: "EXPIRED", lastError: message.slice(0, 500), lastCheckedAt: new Date() },
    });
    return { refreshed: false, reason: message };
  }
}

// ── Instagram OAuth (Instagram API with Instagram Login) ──────────────────

const OAUTH_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "business_management",
].join(",");

export function instagramOAuthUrl(workspaceId: string, userId: string): string {
  if (!env.META_APP_ID) {
    throw new AppError(
      "META_APP_ID is not configured. Set it in .env to enable real Instagram connections (demo mode works without it).",
      400,
      "META_NOT_CONFIGURED",
    );
  }
  const state = `${workspaceId}:${userId}:${randomCode(16)}`;
  const redirectUri = `${env.APP_URL}/api/providers/instagram/callback`;
  const params = new URLSearchParams({
    client_id: env.META_APP_ID,
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPES,
    state,
    response_type: "code",
  });
  // Instagram API with Instagram Login (direct login, no Facebook Page
  // required) — its authorize/token/graph hosts are instagram.com, not
  // facebook.com. The instagram_business_* scopes above only exist on
  // this flow.
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

export interface InstagramOauthResult {
  workspaceId: string;
  userId: string;
}

export function parseOauthState(state: string): InstagramOauthResult {
  const [workspaceId, userId] = state.split(":");
  if (!workspaceId || !userId) throw new AppError("Invalid OAuth state", 400, "OAUTH_STATE");
  return { workspaceId, userId };
}

/**
 * Exchange the OAuth code for a short token, then for an Instagram
 * long-lived user token (60 days).
 */
export async function exchangeInstagramCode(code: string, redirectUri: string) {
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    throw new AppError("Meta credentials missing", 400, "META_NOT_CONFIGURED");
  }
  // 1) Short-lived token: POST form-encoded to api.instagram.com (not a
  // graph.facebook.com GET — Instagram Login's own token endpoint).
  const shortBody = new URLSearchParams({
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const shortRes = await httpFetch(
    "https://api.instagram.com/oauth/access_token",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: shortBody.toString() },
    { timeoutMs: 15000 },
  );
  if (!shortRes.ok) throw new AppError(`OAuth code exchange failed: ${shortRes.status}`, 502, "OAUTH_FAILED");
  const short = JSON.parse(shortRes.body) as { access_token?: string };
  if (!short.access_token) throw new AppError("OAuth returned no token", 502, "OAUTH_FAILED");

  // 2) Exchange for a 60-day long-lived token via graph.instagram.com.
  const longParams = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: env.META_APP_SECRET,
    access_token: short.access_token,
  });
  const longRes = await httpFetch(
    `https://graph.instagram.com/access_token?${longParams.toString()}`,
    { method: "GET" },
    { timeoutMs: 15000 },
  );
  if (!longRes.ok) throw new AppError(`Long-lived token exchange failed: ${longRes.status}`, 502, "OAUTH_FAILED");
  const long = JSON.parse(longRes.body) as { access_token?: string; expires_in?: number };
  if (!long.access_token) throw new AppError("Long-lived exchange returned no token", 502, "OAUTH_FAILED");

  return {
    accessToken: long.access_token,
    tokenExpiresAt: long.expires_in ? new Date(Date.now() + Number(long.expires_in) * 1000) : undefined,
  };
}