"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api, getActiveWorkspace, fmtRelative } from "@/lib/client";
import { PageHeader, StatusBadge, Spinner } from "@/components/ui/ui";

interface Step {
  id: string;
  actionType: string;
  label: string;
  order: number;
  status: string;
  error: string | null;
  result: Record<string, unknown> | null;
  attempts: number;
  delayMs: number;
  startedAt: string | null;
  completedAt: string | null;
}

interface ExecDetail {
  id: string;
  status: string;
  triggerType: string;
  triggerPayload: { text?: string; kind?: string; contact?: { username?: string }; postRef?: string | null };
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  providerEventId: string;
  automation: { id: string; name: string };
  contact: { id: string; username: string; name: string | null } | null;
  steps: Step[];
  webhookDeliveries: { id: string; url: string; status: string; attempts: number; responseStatus: number | null; lastError: string | null; createdAt: string }[];
}

export default function ExecutionPage() {
  const params = useParams<{ executionId: string }>();
  const router = useRouter();
  const ws = getActiveWorkspace();
  const [exec, setExec] = useState<ExecDetail | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ws) return;
    api<{ execution: ExecDetail }>(`/api/workspaces/${ws}/executions/${params.executionId}`)
      .then((r) => setExec(r.execution))
      .catch(() => router.push("/app/executions"));
  }, [ws, params.executionId]);

  if (!exec) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const duration = exec.startedAt && exec.completedAt
    ? Math.round((new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime()) / 1000)
    : null;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={<span className="flex items-center gap-2"><button className="btn-ghost !p-1.5" onClick={() => router.push("/app/executions")} aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>{exec.automation.name}<StatusBadge status={exec.status} /></span>}
        description={`Run ${exec.providerEventId.split(":").slice(0, 2).join(" · ")} · triggered by ${exec.triggerType.replace("_", " ").toLowerCase()}${exec.contact ? ` from @${exec.contact.username}` : ""}`}
      />

      {exec.error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {exec.error}
        </div>
      )}

      {/* Trigger payload */}
      <div className="card mb-4 p-5">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">Trigger payload</h3>
        <p className="text-sm">
          <span className="font-semibold">Text:</span> “{exec.triggerPayload.text ?? "—"}”
          {exec.triggerPayload.postRef && <span className="ml-3 text-muted-light dark:text-muted-dark">post: {exec.triggerPayload.postRef}</span>}
        </p>
        <p className="mt-2 text-[11px] text-muted-light dark:text-muted-dark">
          Started {exec.startedAt ? fmtRelative(exec.startedAt) : "—"} · {duration !== null ? `${duration}s` : "still running"} · idempotency key {exec.providerEventId.slice(0, 24)}…
        </p>
      </div>

      {/* Steps */}
      <div className="card p-5">
        <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">Steps</h3>
        <ol className="relative space-y-3">
          <div aria-hidden className="absolute bottom-5 left-[13px] top-5 w-px bg-line-light dark:bg-line-dark" />
          {exec.steps.length === 0 && <p className="pl-8 text-sm text-muted-light dark:text-muted-dark">No steps — the run was skipped or had no actions.</p>}
          {exec.steps.map((s) => (
            <li key={s.id} className="relative flex items-start gap-3">
              <span className={`z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white ${s.status === "COMPLETED" ? "bg-emerald-500" : s.status === "FAILED" ? "bg-red-500" : s.status === "SKIPPED" ? "bg-slate-400" : "bg-blue-500"}`}>
                {s.order + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{s.label ?? s.actionType.replace("_", " ")}</p>
                  <div className="flex items-center gap-2">
                    {s.attempts > 1 && <span className="text-[11px] text-muted-light dark:text-muted-dark">{s.attempts} attempts</span>}
                    {s.delayMs > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-500/10 dark:text-slate-400">delayed {Math.round(s.delayMs / 1000)}s</span>}
                    <StatusBadge status={s.status} />
                  </div>
                </div>
                {s.error && <p className="mt-1 rounded-lg bg-red-50 px-2.5 py-1.5 font-mono text-[11px] text-red-700 dark:bg-red-500/10 dark:text-red-400">{s.error.slice(0, 400)}</p>}
                {typeof s.result?.reason === "string" && (
                  <p className="mt-1 text-xs text-muted-light dark:text-muted-dark">{s.result.reason}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Webhook deliveries */}
      {exec.webhookDeliveries.length > 0 && (
        <div className="card mt-4 p-5">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">Webhook deliveries</h3>
          <div className="space-y-2">
            {exec.webhookDeliveries.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-canvas-light px-3 py-2 text-xs dark:bg-canvas-dark">
                <span className="max-w-72 truncate font-mono text-accent">{d.url}</span>
                <StatusBadge status={d.status} />
                <span className="text-muted-light dark:text-muted-dark">{d.attempts} attempts{d.responseStatus ? ` · HTTP ${d.responseStatus}` : ""}</span>
                {d.lastError && <span className="w-full truncate text-red-500">{d.lastError}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}