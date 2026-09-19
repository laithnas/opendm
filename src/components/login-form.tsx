"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, ArrowRight, Zap } from "lucide-react";
import { api, markDemoMode } from "@/lib/client";
import { product } from "@/config";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "sent">("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorParam = params.get("error");
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    api<{ demoMode: boolean }>("/api/auth/status", { skipAuthRedirect: true })
      .then((res) => {
        setDemoMode(Boolean(res.demoMode));
        markDemoMode(Boolean(res.demoMode));
      })
      .catch(() => undefined);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setState("loading");
    try {
      const res = await api<{ sent: boolean; previewUrl: string | null }>("/api/auth/magic-link", { method: "POST", body: { email } });
      setState("sent");
      setPreviewUrl(res.previewUrl);
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const demoLogin = async () => {
    try {
      await api("/api/auth/demo", { method: "POST", body: {} });
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login failed");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas-light px-4 dark:bg-canvas-dark">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-lg font-black text-white">LF</div>
          <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
          <p className="mt-1 text-sm text-muted-light dark:text-muted-dark">{product.tagline}</p>
        </div>

        <div className="card card-pad">
          {errorParam && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-400">
              That login link is invalid or expired — request a new one.
            </p>
          )}

          {state === "sent" ? (
            <div className="text-center">
              <Mail className="mx-auto mb-3 h-8 w-8 text-accent" />
              <h2 className="text-base font-semibold">Check your inbox</h2>
              <p className="mt-2 text-sm text-muted-light dark:text-muted-dark">
                We sent a sign-in link to <span className="font-semibold text-ink-light dark:text-ink-dark">{email}</span>. It expires in 15 minutes.
              </p>
              {previewUrl && (
                <div className="mt-4 rounded-lg border border-line-light bg-canvas-light p-3 text-left dark:border-line-dark dark:bg-canvas-dark">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-light dark:text-muted-dark">No mail transport configured</p>
                  <a href={previewUrl} className="mt-1 block break-all text-xs font-medium text-accent hover:underline">
                    {previewUrl}
                  </a>
                </div>
              )}
              <button className="btn-secondary mt-5 w-full" onClick={() => setState("idle")}>
                Back
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="email" className="label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="input"
                  placeholder="you@business.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
              <button type="submit" disabled={state === "loading"} className="btn-primary w-full">
                {state === "loading" ? "Sending…" : <>Send sign-in link <ArrowRight className="h-4 w-4" /></>}
              </button>

              {demoMode && (
                <>
                  <div className="flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-line-light dark:bg-line-dark" />
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-light dark:text-muted-dark">or</span>
                    <div className="h-px flex-1 bg-line-light dark:bg-line-dark" />
                  </div>
                  <button type="button" onClick={demoLogin} className="btn-secondary w-full">
                    <Zap className="h-4 w-4 text-accent" /> Explore the demo
                  </button>
                  <p className="text-center text-[11px] text-muted-light dark:text-muted-dark">Instant demo workspace with seeded data</p>
                </>
              )}
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-light dark:text-muted-dark">Self-hosted · {product.company}</p>
      </div>
    </div>
  );
}