import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import LoginForm from "@/components/login-form";
import { env } from "@/lib/env";
import { getSessionUser, setSessionCookie } from "@/auth/session";
import { ownerLogin } from "@/auth/magic-link";

export default async function LoginPage() {
  if (env.SINGLE_USER_MODE === "true" && env.SINGLE_USER_EMAIL) {
    const existing = await getSessionUser();
    if (!existing) {
      const token = await ownerLogin(env.SINGLE_USER_EMAIL, {
        userAgent: headers().get("user-agent") ?? undefined,
      });
      setSessionCookie(token);
    }
    redirect("/app");
  }

  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-light dark:text-muted-dark">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
