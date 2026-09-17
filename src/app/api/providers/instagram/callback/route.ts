import { NextRequest, NextResponse } from "next/server";
import type { SocialConnection } from "@prisma/client";
import { parseOauthState, exchangeInstagramCode, connectInstagram } from "@/modules/providers/connections";
import { getSocialProvider } from "@/modules/providers/registry";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import { audit } from "@/modules/audit/service";

export const runtime = "nodejs";

// Instagram OAuth callback (Meta Login for Business).
// /api/providers/instagram/callback?code=…&state=…

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const redirectUri = `${env.APP_URL}/api/providers/instagram/callback`;

  const fail = (message: string) =>
    NextResponse.redirect(new URL(`/app/settings/connections?oauth_error=${encodeURIComponent(message)}`, env.APP_URL));

  if (error) return fail(`Meta returned: ${error}`);
  if (!code || !state) return fail("Missing OAuth parameters");

  let parsed;
  try {
    parsed = parseOauthState(state);
  } catch {
    return fail("Invalid OAuth state");
  }
  const { workspaceId, userId } = parsed;

  // Verify the user is still a member of the workspace (state could be leaked).
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) return fail("You are not a member of that workspace");

  try {
    const { accessToken, tokenExpiresAt } = await exchangeInstagramCode(code, redirectUri);
    // Resolve the Instagram professional account id from the token. The
    // provider context only needs identifying fields — no DB row yet.
    const provider = getSocialProvider("instagram");
    const placeholder = {
      id: "pending",
      workspaceId,
      connectedByUserId: userId,
      provider: "INSTAGRAM",
      externalAccountId: "pending",
      username: "pending",
      displayName: null,
      accessTokenEnc: "pending",
      refreshTokenEnc: null,
      tokenExpiresAt: null,
      status: "PENDING",
      lastError: null,
      lastCheckedAt: null,
      scopes: [],
      meta: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as SocialConnection;
    const account = await provider.fetchAccount({
      connection: placeholder,
      accessToken,
      apiVersion: env.META_GRAPH_VERSION,
    });

    await connectInstagram({
      workspaceId,
      userId,
      externalAccountId: account.externalId,
      username: account.username,
      displayName: account.displayName,
      accessToken,
      tokenExpiresAt,
      meta: { followers: account.followersCount },
    });
    // Clean up any stale placeholder rows.
    await prisma.socialConnection.deleteMany({ where: { workspaceId, externalAccountId: "pending" } });

    await audit({
      workspaceId,
      actorUserId: userId,
      action: "connection.added",
      entityType: "connection",
      entityId: account.externalId,
      meta: { provider: "instagram", oauth: true, username: account.username },
    });
    log.info("instagram oauth connected", { workspaceId, accountId: account.externalId });
    return NextResponse.redirect(new URL("/app/settings/connections?connected=1", env.APP_URL));
  } catch (err) {
    log.error("instagram oauth failed", { error: err instanceof Error ? err.message : String(err) });
    return fail(err instanceof Error ? err.message.slice(0, 300) : "OAuth failed");
  }
}