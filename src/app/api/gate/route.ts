import { NextRequest, NextResponse } from "next/server";
import { hashGateToken } from "@/lib/gate";

// Plain (non-apiRoute) handler: this runs *before* the app's own auth and
// workspace machinery even applies, so it deliberately doesn't use those.

export async function POST(req: NextRequest) {
  const password = process.env.ACCESS_PASSWORD;
  if (!password) return NextResponse.json({ ok: true });

  const form = await req.formData().catch(() => null);
  const submitted = String(form?.get("password") ?? "");
  const next = String(form?.get("next") ?? "/");

  const url = req.nextUrl.clone();
  if (submitted !== password) {
    url.pathname = "/gate";
    url.search = `?next=${encodeURIComponent(next)}&error=1`;
    return NextResponse.redirect(url);
  }

  url.pathname = next.startsWith("/") ? next : "/";
  url.search = "";
  const res = NextResponse.redirect(url);
  res.cookies.set("leonyx_gate", await hashGateToken(password), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
