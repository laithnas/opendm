import { NextRequest, NextResponse } from "next/server";
import { findLinkBySlug, recordLinkClick } from "@/modules/links/service";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// Tracked-link redirect: /l/:slug → destination, recording the click.
// Hidden via signed short URLs only (randomized slugs, no guessable ids).

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const { slug } = params;
  const link = await findLinkBySlug(slug);
  if (!link) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin), 302);
  }

  // Best-effort click recording: never block the redirect on a DB hiccup.
  try {
    await recordLinkClick(link.id, link.workspaceId, {
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent"),
      referrer: req.headers.get("referer"),
    });
  } catch {
    // swallow — the redirect matters more than the metric
  }

  return NextResponse.redirect(new URL(link.destination), 302);
}