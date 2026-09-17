"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { api, getActiveWorkspace, fmtRelative } from "@/lib/client";
import { PageHeader, StatCard, EmptyState, Skeleton } from "@/components/ui/ui";

interface DashboardData {
  metrics: {
    executions: { total: number; completed: number; skipped: number; failed: number; partial: number };
    messages: { sent: number; failed: number; deliveryRate: number | null };
    links: { clicks: number; uniqueClicks: number; ctr: number | null };
    comments: number;
    conversations: number;
  };
  series: { day: string; kind: string; n: number }[];
  automations: { automationId: string; name: string; executions: number; completed: number; clicks: number; conversion: number }[];
  keywords: { keyword: string; count: number }[];
  funnel: { comments: number; dmsSent: number; clicks: number; commentToDm: number | null; dmToClick: number | null };
  health: { connections: { id: string; username: string; status: string }[]; byStatus: Record<string, number> };
  failures: { id: string; automation: { name: string }; error: string | null; steps: { label: string; error: string | null }[] }[];
}

const TRIGGER_ICON: Record<string, React.ElementType> = {
  COMMENT: () => <span className="text-[10px]">💬</span>,
  DM: () => <span className="text-[10px]">✉️</span>,
  STORY_REPLY: () => <span className="text-[10px]">↩️</span>,
};

export default function DashboardPage() {
  const router = useRouter();
  const ws = getActiveWorkspace();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState("30");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    if (!ws) return;
    const from = new Date();
    from.setDate(from.getDate() - Number(range));
    api<DashboardData>(`/api/workspaces/${ws}/analytics?from=${from.toISOString()}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [ws, range]);

  const totals = data?.metrics;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Real numbers from executions, sends and clicks. Nothing here is estimated."
        actions={
          <div className="flex gap-1 rounded-lg border border-line-light p-0.5 dark:border-line-dark">
            {["7", "30", "90"].map((d) => (
              <button key={d} onClick={() => setRange(d)} className={`rounded-md px-3 py-1 text-xs font-semibold ${range === d ? "bg-ink-light text-white dark:bg-ink-dark dark:text-ink-light" : "text-muted-light dark:text-muted-dark"}`}>
                {d}d
              </button>
            ))}
          </div>
        }
      />

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">{error}</p>}

      {!data ? (
        <><Skeleton className="h-24 rounded-xl" /><Skeleton className="mt-4 h-72 rounded-xl" /></>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Triggers" value={totals?.executions.total ?? 0} sub={`${totals?.executions.completed ?? 0} completed`} />
            <StatCard label="DMs sent" value={totals?.messages.sent ?? 0} sub={totals?.messages.failed ? `${totals.messages.failed} failed` : "no failures"} />
            <StatCard label="Link clicks" value={totals?.links.clicks ?? 0} sub={`${totals?.links.uniqueClicks ?? 0} unique`} />
            <StatCard label="Conversations" value={totals?.conversations ?? 0} sub={`CTR ${pct(totals?.links.ctr)}`} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {/* Activity chart */}
            <div className="card card-pad lg:col-span-2">
              <h3 className="mb-4 text-sm font-bold">Activity over time</h3>
              <ActivityChart series={data.series} />
            </div>

            {/* Funnel */}
            <div className="card card-pad">
              <h3 className="mb-4 text-sm font-bold">Conversion funnel</h3>
              <Funnel funnel={data.funnel} />
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {/* Top automations */}
            <div className="card lg:col-span-2">
              <div className="flex items-center justify-between p-5 pb-3">
                <h3 className="text-sm font-bold">Top automations</h3>
                <button className="btn-ghost text-xs" onClick={() => router.push("/app/automations")}>View all</button>
              </div>
              {data.automations.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-light dark:text-muted-dark">No executions in this period yet.</p>
              ) : (
                <table className="table-base">
                  <thead><tr><th>Automation</th><th>Triggers</th><th>Completed</th><th>Clicks</th><th>Conversion</th></tr></thead>
                  <tbody>
                    {data.automations.map((a) => (
                      <tr key={a.automationId} onClick={() => router.push(`/app/automations/${a.automationId}`)}>
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

            {/* Top keywords */}
            <div className="card card-pad">
              <h3 className="mb-4 text-sm font-bold">Top keywords</h3>
              {data.keywords.length === 0 ? (
                <p className="text-sm text-muted-light dark:text-muted-dark">No keyword matches yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.keywords.map((k) => {
                    const max = data.keywords[0]?.count ?? 1;
                    return (
                      <div key={k.keyword}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="font-semibold">“{k.keyword}”</span>
                          <span className="text-muted-light dark:text-muted-dark">{k.count}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/40">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(8, (k.count / max) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Failures */}
          <div className="card mt-6">
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="text-sm font-bold">Recent failures</h3>
              <button className="btn-ghost text-xs" onClick={() => router.push("/app/executions?status=FAILED")}>All executions</button>
            </div>
            {data.failures.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-light dark:text-muted-dark">No failed executions in this period. 🎉</p>
            ) : (
              <div className="space-y-2 px-5 pb-5">
                {data.failures.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg bg-red-50/60 px-3 py-2 text-xs dark:bg-red-500/5">
                    <div className="min-w-0">
                      <p className="font-semibold">{f.automation.name}</p>
                      <p className="truncate text-muted-light dark:text-muted-dark">{f.steps[0]?.error ?? f.error ?? "failed"}</p>
                    </div>
                    <button onClick={() => router.push(`/app/executions/${f.id}`)} className="shrink-0 text-accent hover:underline">Inspect</button>
                  </div>
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

function ActivityChart({ series }: { series: { day: string; kind: string; n: number }[] }) {
  // Group per day, stacked bars of executions / dms / clicks.
  const days = new Map<string, { exec: number; dm: number; click: number }>();
  for (const s of series) {
    const key = s.day.slice(0, 10);
    const entry = days.get(key) ?? { exec: 0, dm: 0, click: 0 };
    if (s.kind === "execution") entry.exec += s.n;
    if (s.kind === "dm_sent") entry.dm += s.n;
    if (s.kind === "click") entry.click += s.n;
    days.set(key, entry);
  }
  const list = [...days.entries()].slice(-14);
  const max = Math.max(1, ...list.map(([, v]) => v.exec + v.dm + v.click));
  const colors = { exec: "bg-ink-light dark:bg-ink-dark", dm: "bg-accent", click: "bg-emerald-500" };

  if (list.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-light dark:text-muted-dark">No activity in this period.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex h-40 items-end gap-2">
        {list.map(([day, v]) => (
          <div key={day} className="group flex min-w-6 flex-1 flex-col items-center gap-1">
            <div className="flex h-32 w-full flex-col justify-end gap-px">
              <div className={`${colors.dm} rounded-t-sm transition-all group-hover:opacity-80`} style={{ height: `${Math.max(2, (v.dm / max) * 100)}%` }} title={`${v.dm} DMs`} />
              <div className={`${colors.click} transition-all group-hover:opacity-80`} style={{ height: `${Math.max(2, (v.click / max) * 100)}%` }} title={`${v.click} clicks`} />
              <div className={`${colors.exec} rounded-b-sm transition-all group-hover:opacity-80`} style={{ height: `${Math.max(2, (v.exec / max) * 100)}%` }} title={`${v.exec} triggers`} />
            </div>
            <span className="text-[10px] text-muted-light dark:text-muted-dark">{day.slice(5)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-[11px] text-muted-light dark:text-muted-dark">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent" /> DMs sent</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> Clicks</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-ink-light dark:bg-ink-dark" /> Triggers</span>
      </div>
    </div>
  );
}

function Funnel({ funnel }: { funnel: DashboardData["funnel"] }) {
  const steps = [
    { label: "Comments", value: funnel.comments },
    { label: "DMs sent", value: funnel.dmsSent, rate: funnel.commentToDm },
    { label: "Clicks", value: funnel.clicks, rate: funnel.dmToClick },
  ];
  const max = Math.max(1, funnel.comments);
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={s.label}>
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">{s.label}</span>
            <span className="tabular-nums text-muted-light dark:text-muted-dark">{s.value}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/40">
              <div className={`h-full rounded-full ${i === 0 ? "bg-ink-light dark:bg-ink-dark" : i === 1 ? "bg-accent" : "bg-emerald-500"}`} style={{ width: `${Math.max(6, (s.value / max) * 100)}%` }} />
            </div>
            {s.rate !== null && <span className="w-10 text-right text-[10px] tabular-nums text-muted-light dark:text-muted-dark">{pct(s.rate)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}