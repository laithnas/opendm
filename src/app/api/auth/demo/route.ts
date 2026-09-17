import { apiRoute, json } from "@/lib/api";
import { demoLogin } from "@/auth/magic-link";
import { setSessionCookie } from "@/auth/session";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

// Demo-mode one-click login. Only enabled when DEMO_MODE=true.

export const POST = apiRoute({
  auth: false,
  handler: async (ctx) => {
    if (env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") {
      throw new AppError("Demo mode is not enabled", 404, "DEMO_DISABLED");
    }
    const token = await demoLogin({
      ip: ctx.clientIp ?? undefined,
      userAgent: ctx.req.headers.get("user-agent") ?? undefined,
    });
    setSessionCookie(token);
    return json({ ok: true });
  },
});