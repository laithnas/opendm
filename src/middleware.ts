import { NextRequest, NextResponse } from "next/server";
import { hashGateToken } from "@/lib/gate";

// Site-wide password gate for the private Leonyx AI deployment.
//
// This sits in FRONT of the app's own per-user auth (magic links + workspace
// membership) — it just stops anyone who doesn't know ACCESS_PASSWORD from
// even reaching the login page. It does nothing when ACCESS_PASSWORD is
// unset, so the public OpenDM repo behaves exactly as before.
//
// Meta's webhook can't present a browser cookie, so /api/webhooks/* is
// always exempt — those routes verify Meta's own request signature instead.

const COOKIE_NAME = "leonyx_gate";
const EXEMPT_PREFIXES = ["/api/webhooks/", "/_next/", "/favicon.ico"];

export async function middleware(req: NextRequest) {
  const password = process.env.ACCESS_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (pathname === "/gate" || pathname === "/api/gate") {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie && cookie === (await hashGateToken(password))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/gate";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
