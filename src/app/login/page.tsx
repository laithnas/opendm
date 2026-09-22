import { Suspense } from "react";
import { redirect } from "next/navigation";
import LoginForm from "@/components/login-form";
import { env } from "@/lib/env";

export default function LoginPage() {
  if (env.SINGLE_USER_MODE === "true" && env.SINGLE_USER_EMAIL) {
    redirect("/api/auth/owner");
  }

  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-light dark:text-muted-dark">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
