import { Suspense } from "react";
import LoginForm from "@/components/login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-light dark:text-muted-dark">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}