"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Sparkles, MessageSquare, MousePointerClick, Link2 } from "lucide-react";
import { api, getActiveWorkspace } from "@/lib/client";
import { PageHeader, StatCard, EmptyState, Skeleton, useToast } from "@/components/ui/ui";

interface AnalyticsData {
  metrics: {
    executions: { total: number; completed: number; skipped: number; failed: number; partial: number };
    messages: { sent: number; failed: number; deliveryRate: number | null };
    links: { clicks: number; uniqueClicks: number; ctr: number | null };
    comments: number;
    conversations: number;
  };
  automations: { automationId: string; name: string; executions: number; completed: number; clicks: number; conversion: number }[];
  keywords: { keyword: string; count: number }[];
  funnel: { comments: number; dmsSent: number; clicks: number; commentToDm: number | null; dmToClick: number | null };
  health: { connections: { id: string; username: string; status: string; lastCheckedAt: string | null; lastError: string | null }[]; byStatus: Record<string, number> };
  failures: { id: string; automation: { name: string }; createdAt: string }[];
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const ws = getActiveWorkspace();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [range, setRange] = useState("30");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");

  const load = (fromIso?: string, toIso?: string) => {
    if (!ws) return;
    const params = new URLSearchParams();
    if (fromIso) params.set("from", fromIso);
    if (toIso) params.set("to", toIso);
    api<AnalyticsData>(`/api/workspaces/${ws}/analytics?${params.toString()}`)
      .then(setData)
      .catch(() => setData(null));
  };

  useEffect(() => {
    const from = new Date();
    from.setDate(from.getDate() - Number(range));
    load(from.toISOString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, range]);

  const applyCustom = () => {
    if (!fromInput || !toInput) {
      toast("error", "Pick both dates");
      return;
    }
    load(new Date(fromInput).toISOString(), new Date(toInput + "T23:59:59").toISOString());
    setRange("custom");
  };

  const insightRequest = async () => {
    if (!data) return;
    try {
      const res = await api<{ insight: string }>(`/api/workspaces/${ws}/ai`, {
        method: "POST",
        body: { feature: "insight", metrics: { ...data.metrics, automations: data.automations.slice(0, 3) } },
      });
      toast("info", res.insight);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "AI not configured");
    }
  };

  const m = data?.metrics;
  const byStatus = data?.health.byStatus ?? {};

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Every number derives from real executions, sends and clicks."
        actions={
          <>
            <div className="flex gap-1 rounded-lg border border-line-light p-0.5 dark:border-line-dark">
              {["7", "30", "90"].map((d) => (
                <button key={d} onClick={() => setRange(d)} className={`rounded-md px-3 py-1 text-xs font-semibold ${range === d ? "bg-ink-light text-white dark:bg-ink-dark dark:text-ink-light" : "text-muted-light dark:text-muted-dark"}`}>{d}d</button>
              ))}
            </div>
            <button className="btn-secondary" onClick={insightRequest} disabled={!data}>
              <Sparkles className="h-4 w-4 text-accent" /> AI summary
            </button>
          </>
        }
      />

      {range === "custom" && (
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div><label className="label">From</label><input type="date" className="input !w-44" value={fromInput} onChange={(e) => setFromInput(e.target.value)} /></div>
          <div><label className="label">To</label><input type="date" className="input !w-44" value={toInput} onChange={(e) => setToInput(e.target.value)} /></div>
          <button className="btn-secondary" onClick={applyCustom}>Apply</button>
        </div>
      )}

      {!data ? (
        <>
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="mt-4 h-80 rounded-xl" />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Triggers" value={m?.executions.total ?? 0} sub={`${m?.executions.completed ?? 0} completed · ${m?.executions.skipped ?? 0} skipped`} />
            <StatCard label="DMs sent" value={m?.messages.sent ?? 0} sub={`${pct(m?.messages.deliveryRate)} delivery`} />
            <StatCard label="Link clicks" value={m?.links.clicks ?? 0} sub={`${m?.links.uniqueClicks ?? 0} unique · CTR ${pct(m?.links.ctr)}`} />
            <StatCard label="Comments" value={m?.comments ?? 0} sub={`${data.health.connections.length} connected account${data.health.connections.length === 1 ? "" : "s"}`} />
          </div>

          {/* Account health */}
          <div className="card mt-6 p-5">
            <h3 className="mb-3 text-sm font-bold">Account health</h3>
            {data.health.connections.length === 0 ? (
              <p className="text-sm text-muted-light dark:text-muted-dark">No social accounts connected.</p>
            ) : (
              <div className="space-y-2">
                {data.health.connections.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-canvas-light px-3 py-2 text-xs dark:bg-canvas-dark">
                    <span className="font-semibold">@{c.username}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${c.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"}`}>
                      {c.status.toLowerCase()}
                    </span>
                    {c.lastError && <span className="w-full truncate text-muted-light dark:text-muted-dark">error: {c.lastError}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top automations */}
          <div className="card mt-6">
            <div className="p-5 pb-3"><h3 className="text-sm font-bold">Top automations</h3></div>
            {data.automations.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-light dark:text-muted-dark">No executions in this period.</p>
            ) : (
              <table className="table-base">
                <thead><tr><th>Automation</th><th>Triggers</th><th>Completed</th><th>Clicks</th><th>Trigger→Complete</th></tr></thead>
                <tbody>
                  {data.automations.map((a) => (
                    <tr key={a.automationId} className="cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03]" onClick={() => router.push(`/app/automations/${a.automationId}`)}>
                      <td className="font-medium">{a.name}</td>
                      <td>{a.executions}</td>
                      <td>{a.completed}</td>
                      <td>{a.clicks}</td>
                      <td>{pct(a.conversion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="card card-pad">
              <h3 className="mb-3 text-sm font-bold">Top keywords</h3>
              {data.keywords.length === 0 ? <p className="text-sm text-muted-light dark:text-muted-dark">No keyword matches this period.</p> : (
                <div className="space-y-2.5">
                  {data.keywords.map((k) => {
                    const max = data.keywords[0]?.count ?? 1;
                    return (
                      <div key={k.keyword}>
                        <div className="mb-1 flex justify-between text-xs"><span className="font-semibold">“{k.keyword}”</span><span className="text-muted-light dark:text-muted-dark">{k.count}</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/40"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(8, (k.count / max) * 100)}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card card-pad">
              <h3 className="mb-3 text-sm font-bold">Conversion funnel</h3>
              <div className="space-y-3">
                {[
                  { label: "Comments", value: data.funnel.comments, icon: MousePointerClick, color: "bg-ink-light dark:bg-ink-dark" },
                  { label: "DMs sent", value: data.funnel.dmsSent, icon: MessageSquare, color: "bg-accent", rate: data.funnel.commentToDm },
                  { label: "Clicks", value: data.funnel.clicks, icon: Link2, color: "bg-emerald-500", rate: data.funnel.dmToClick },
                ].map((s, i, all) => {
                  const max = Math.max(1, data.funnel.comments);
                  return (
                    <div key={s.label}>
                      <div className="flex justify-between text-xs"><span className="font-semibold">{s.label}</span><span className="tabular-nums text-muted-light dark:text-muted-dark">{s.value}</span></div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/40"><div className={`h-full rounded-full ${s.color}`} style={{ width: `${Math.max(6, (s.value / max) * 100)}%` }} /></div>
                        {s.rate !== null && <span className="w-10 text-right text-[10px] text-muted-light dark:text-muted-dark">{pct(s.rate)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Failures */}
          <div className="card mt-6 p-5">
            <h3 className="mb-3 text-sm font-bold">Failures</h3>
            {data.failures.length === 0 ? (
              <p className="text-sm text-muted-light dark:text-muted-dark">No failed executions in this period.</p>
            ) : (
              <div className="space-y-1.5">
                {data.failures.map((f) => (
                  <button key={f.id} className="flex w-full items-center justify-between rounded-lg bg-red-50/60 px-3 py-2 text-left text-xs hover:bg-red-50 dark:bg-red-500/5 dark:hover:bg-red-500/10" onClick={() => router.push(`/app/executions/${f.id}`)}>
                    <span className="font-semibold">{f.automation.name}</span>
                    <span className="text-muted-light dark:text-muted-dark">{new Date(f.createdAt).toLocaleDateString()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function pct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(1)}%`;
}