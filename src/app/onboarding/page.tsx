"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RadioTower, Zap } from "lucide-react";
import { api, setActiveWorkspace } from "@/lib/client";
import { product } from "@/config";

// Onboarding: create a workspace → connect Instagram (or demo account).

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<"workspace" | "connect">("workspace");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);

  const createWorkspace = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { workspaceId } = await api<{ workspaceId: string }>("/api/workspaces", { method: "POST", body: { name } });
      setActiveWorkspace(workspaceId);
      setStep("connect");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setBusy(false);
    }
  };

  const connectDemo = async () => {
    setBusy(true);
    try {
      await api("/api/workspaces/" + getWs() + "/connections", { method: "POST", body: { action: "demo" } });
      router.push("/app/automations?new=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect demo account");
      setBusy(false);
    }
  };

  const getWs = () => document.cookie.split("; ").find((c) => c.startsWith("lf_ws="))?.split("=")[1] ?? "";

  const startOAuth = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ oauthUrl?: string }>("/api/workspaces/" + getWs() + "/connections", { method: "POST", body: {} });
      if (res.oauthUrl) window.location.href = res.oauthUrl;
      else {
        setError("Meta app credentials are not configured — use the demo account or add META_APP_ID to .env.");
        setBusy(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start connection");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas-light px-4 dark:bg-canvas-dark">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-lg font-black text-white">LF</div>
          <h1 className="text-2xl font-bold tracking-tight">{step === "workspace" ? "Create your workspace" : "Connect Instagram"}</h1>
          <p className="mt-1 text-sm text-muted-light dark:text-muted-dark">
            {step === "workspace" ? "Workspaces keep automations, contacts and data isolated per business." : "Automations trigger from comments, DMs and story replies."}
          </p>
        </div>

        <div className="card card-pad">
          {step === "workspace" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createWorkspace();
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="ws-name" className="label">
                  Workspace name
                </label>
                <input
                  id="ws-name"
                  className="input"
                  placeholder="e.g. The Barbershop Studio"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
              <button type="submit" disabled={busy || !name.trim()} className="btn-primary w-full">
                {busy ? "Creating…" : `Create workspace →`}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <button onClick={connectDemo} disabled={busy} className="btn-primary w-full">
                <Zap className="h-4 w-4" /> Connect demo account
              </button>
              <button onClick={startOAuth} disabled={busy} className="btn-secondary w-full">
                <Sparkles className="h-4 w-4" /> Connect real Instagram
              </button>
              {oauthUrl && (
                <a href={oauthUrl} className="btn-secondary w-full">
                  Continue on Facebook
                </a>
              )}
              {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
              <p className="flex items-start gap-1.5 pt-1 text-[11px] text-muted-light dark:text-muted-dark">
                <RadioTower className="mt-0.5 h-3 w-3 shrink-0" />
                Real connections use Instagram&apos;s official API (Meta Login for Business). No passwords, no scraping. Demo account works everywhere without credentials.
              </p>
              <button className="btn-ghost w-full text-xs" onClick={() => router.push("/app")}>
                Skip for now
              </button>
            </div>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-muted-light dark:text-muted-dark">
          {product.name} · {product.company}
        </p>
      </div>
    </div>
  );
}