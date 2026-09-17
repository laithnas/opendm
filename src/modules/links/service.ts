import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { newSlug } from "@/lib/ids";
import { hashIp } from "@/lib/crypto";
import { env } from "@/lib/env";

// Tracked links: short non-guessable redirects with click metrics.

export interface CreateLinkInput {
  workspaceId: string;
  name: string;
  destination: string;
  automationId?: string | null;
  createdById?: string | null;
}

export async function createTrackedLink(input: CreateLinkInput) {
  validateDestination(input.destination);
  const slug = await uniqueSlug();
  return prisma.trackedLink.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name.trim().slice(0, 200),
      destination: input.destination,
      slug,
      automationId: input.automationId ?? null,
      createdById: input.createdById ?? null,
    },
  });
}

/** Reuse an existing link by slug; create when missing (used by actions). */
export async function resolveTrackedLink(workspaceId: string, slug: string, fallback: { name: string; destination: string }) {
  const existing = await prisma.trackedLink.findUnique({ where: { slug } });
  if (existing && existing.workspaceId === workspaceId) return existing;
  if (existing) throw new AppError("Link slug belongs to another workspace", 403, "FORBIDDEN");
  return createTrackedLink({ workspaceId, name: fallback.name, destination: fallback.destination });
}

export async function getLinksForWorkspace(workspaceId: string) {
  return prisma.trackedLink.findMany({
    where: { workspaceId },
    include: { automation: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function findLinkBySlug(slug: string) {
  return prisma.trackedLink.findUnique({ where: { slug } });
}

export interface ClickContext {
  ip?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
  contactId?: string | null;
}

export async function recordLinkClick(linkId: string, workspaceId: string, ctx: ClickContext) {
  const uniqueKey = ctx.contactId ? `${linkId}:${ctx.contactId}` : `${linkId}:anon:${hashIp(ctx.ip) ?? "u"}`;
  const existing = await prisma.linkClick.findUnique({ where: { linkId_uniqueKey: { linkId, uniqueKey } } });
  if (existing) {
    // Same person clicked again: count the click but not a unique click.
    await prisma.linkClick.update({
      where: { id: existing.id },
      data: {
        userAgent: ctx.userAgent ?? existing.userAgent,
        referrer: ctx.referrer ?? existing.referrer,
      },
    });
    await prisma.trackedLink.update({
      where: { id: linkId },
      data: { clickCount: { increment: 1 } },
    });
    return { unique: false, clickId: existing.id };
  }
  await prisma.$transaction([
    prisma.linkClick.create({
      data: {
        workspaceId,
        linkId,
        contactId: ctx.contactId ?? null,
        uniqueKey,
        ipHash: hashIp(ctx.ip),
        userAgent: ctx.userAgent?.slice(0, 512) ?? null,
        referrer: ctx.referrer?.slice(0, 1024) ?? null,
      },
    }),
    prisma.trackedLink.update({
      where: { id: linkId },
      data: { clickCount: { increment: 1 }, uniqueClickCount: { increment: 1 } },
    }),
  ]);
  return { unique: true };
}

export function linkUrl(slug: string): string {
  return `${env.APP_URL}/l/${slug}`;
}

async function uniqueSlug(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = newSlug();
    const existing = await prisma.trackedLink.findUnique({ where: { slug } });
    if (!existing) return slug;
  }
  throw new AppError("Could not allocate a unique link slug", 500, "SLUG_EXHAUSTED");
}

// ── Destination security ──────────────────────────────────────────────────

/**
 * Allow only public http(s) destinations. Blocks private/loopback/link-local
 * hosts (open-redirect + SSRF abuse), URLs with embedded credentials, and
 * non-http protocols.
 */
export function validateDestination(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError("Destination must be a valid URL", 422, "VALIDATION_ERROR");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AppError("Only http(s) destinations are allowed", 422, "VALIDATION_ERROR");
  }
  if (url.username || url.password) {
    throw new AppError("Destinations cannot contain credentials", 422, "VALIDATION_ERROR");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new AppError("Localhost destinations are not allowed", 422, "VALIDATION_ERROR");
  }
  // IP literal checks (IPv4; IPv6 literals contain ":" and are rejected).
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a = 0, b = 0, c = 0, d = 0] = ipv4.slice(1).map(Number);
    const isPrivate =
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0 ||
      a >= 224;
    if (isPrivate) {
      throw new AppError("Private network destinations are not allowed", 422, "VALIDATION_ERROR");
    }
  }
  if (host.includes(":")) {
    throw new AppError("IPv6 destinations are not allowed", 422, "VALIDATION_ERROR");
  }
  return url.toString();
}