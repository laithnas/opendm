import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { randomCode } from "@/lib/ids";
import { env } from "@/lib/env";
import { UnauthorizedError } from "@/lib/errors";
import type { Session, User, WorkspaceMember, Workspace } from "@prisma/client";

// Session management.
//  - Raw token lives in an httpOnly cookie; only its hash is stored.
//  - Sessions expire after SESSION_TTL_DAYS of absolute life.

const SESSION_COOKIE = "lf_session";
const WORKSPACE_COOKIE = "lf_ws";
const SESSION_TTL_DAYS = 30;

export interface SessionUser extends User {}

export async function createSession(userId: string, ctx?: { ip?: string; userAgent?: string }): Promise<string> {
  const raw = randomCode(32);
  await prisma.session.create({
    data: {
      tokenHash: sha256(raw),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
      ip: ctx?.ip,
      userAgent: ctx?.userAgent?.slice(0, 512),
    },
  });
  return raw;
}

/** Returns the raw session token from the request cookie jar. */
export function readSessionCookie(): string | undefined {
  return cookies().get(SESSION_COOKIE)?.value;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const raw = readSessionCookie();
  if (!raw) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(raw) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function revokeSession(): Promise<void> {
  const raw = readSessionCookie();
  if (raw) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(raw) } });
  }
}

export function setSessionCookie(rawToken: string): void {
  cookies().set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(): void {
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

// ── Active workspace (client-side convenience cookie) ─────────────────────

export function setWorkspaceCookie(workspaceId: string): void {
  cookies().set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: false, // readable by client JS for header injection
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export function readWorkspaceCookie(): string | undefined {
  return cookies().get(WORKSPACE_COOKIE)?.value;
}

export type MemberWithWorkspace = WorkspaceMember & {
  workspace: Pick<Workspace, "id" | "name" | "slug">;
};