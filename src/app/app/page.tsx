"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MousePointerClick, MessageSquare, CornerDownRight, Zap } from "lucide-react";
import { api, post, getActiveWorkspace, fmtRelative, isDemoMode } from "@/lib/client";
import { PageHeader, StatCard, EmptyState, Skeleton, useToast } from "@/components/ui/ui";

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

type Metric = "exec" | "dm" | "click";

// Dedicated, well-separated hues per metric — used consistently across the
// KPI tiles, chart bars, and legend so cross-filtering reads at a glance.
const METRIC_COLOR: Record<Metric, { bar: string; ring: string; dot: string }> = {
  exec: { bar: "bg-violet-500", ring: "ring-violet-500 border-violet-500", dot: "bg-violet-500" },
  dm: { bar: "bg-accent", ring: "ring-accent border-accent", dot: "bg-accent" },
  click: { bar: "bg-teal-500", ring: "ring-teal-500 border-teal-500", dot: "bg-teal-500" },
};

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
  const [busyEvent, setBusyEvent] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    if (!ws) return;
    const from = new Date();
    from.setDate(from.getDate() - Number(range));
    api<DashboardData>(`/api/workspaces/${ws}/analytics?from=${from.toISOString()}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [ws, range]);

  const { toast } = useToast();

  // Demo-only: fire a realistic simulated event through the real queue.
  const fireDemoEvent = async (kind: "COMMENT" | "DM" | "STORY_REPLY") => {
    if (!ws) return;
    const names = ["sarah.waves", "fade.hunter", "dreads.dana", "trim.tom", "nina.naps", "vic.fade"];
    const username = names[Math.floor(Math.random() * names.length)] ?? "demo.follower";
    const payload =
      kind === "COMMENT"
        ? { kind, text: "GUIDE", username, externalUserId: `live-demo-${Date.now()}` }
        : kind === "DM"
          ? { kind, text: "hi! what's your pricing?", username, externalUserId: `live-demo-${Date.now()}` }
          : { kind, text: "YES", username, externalUserId: `live-demo-${Date.now()}` };
    setBusyEvent(kind);
    try {
      const res = await post<{ eventId: string }>("/api/webhooks/test", payload);
      setLastEvent(res.eventId);
      toast("success", kind === "COMMENT" ? "Comment fired. Watch it run live." : kind === "DM" ? "DM fired. Watch it run live." : "Story reply fired. Watch it run live.");
      // Refresh the dashboard numbers a moment later so the demo looks alive.
      window.setTimeout(() => {
        const from = new Date();
        from.setDate(from.getDate() - Number(range));
        api<DashboardData>(`/api/workspaces/${ws}/analytics?from=${from.toISOString()}`).then(setData).catch(() => undefined);
      }, 4500);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Demo trigger failed");
    } finally {
      setBusyEvent(null);
    }
  };

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

      {isDemoMode() && (
        <div className="card mb-6 border-accent/30 bg-accent/[0.03] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Zap className="h-4 w-4 text-accent" /> Live demo trigger
              </h3>
              <p className="mt-1 text-xs text-muted-light dark:text-muted-dark">
                Press a button and watch OpenDM do its thing in real time. The event travels through the actual queue, worker and engine.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary !py-1.5 text-xs" disabled={Boolean(busyEvent)} onClick={() => fireDemoEvent("COMMENT")}>
                <MousePointerClick className="h-3.5 w-3.5" /> {busyEvent === "COMMENT" ? "Firing…" : "Simulate a comment (GUIDE)"}
              </button>
              <button className="btn-secondary !py-1.5 text-xs" disabled={Boolean(busyEvent)} onClick={() => fireDemoEvent("DM")}>
                <MessageSquare className="h-3.5 w-3.5" /> {busyEvent === "DM" ? "Firing…" : "Simulate a DM"}
              </button>
              <button className="btn-secondary !py-1.5 text-xs" disabled={Boolean(busyEvent)} onClick={() => fireDemoEvent("STORY_REPLY")}>
                <CornerDownRight className="h-3.5 w-3.5" /> {busyEvent === "STORY_REPLY" ? "Firing…" : "Story reply"}
              </button>
            </div>
          </div>
          {lastEvent && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-canvas-light px-3 py-2 text-xs dark:bg-canvas-dark">
              <span>
                Event <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] dark:bg-surface-dark">{lastEvent.slice(0, 24)}…</code> queued
              </span>
              <button className="font-semibold text-accent hover:underline" onClick={() => router.push("/app/executions")}>
                Watch it run →
              </button>
            </div>
          )}
        </div>
      )}

      {!data ? (
        <><Skeleton className="h-24 rounded-xl" /><Skeleton className="mt-4 h-72 rounded-xl" /></>
      ) : (
        <>
          {/* KPI row — click a card to isolate that metric in the chart below */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              label="Triggers"
              value={totals?.executions.total ?? 0}
              sub={`${totals?.executions.completed ?? 0} completed`}
              onClick={() => setMetric((m) => (m === "exec" ? null : "exec"))}
              active={metric === "exec"}
              dimmed={metric !== null && metric !== "exec"}
              ringClass={METRIC_COLOR.exec.ring}
            />
            <StatCard
              label="DMs sent"
              value={totals?.messages.sent ?? 0}
              sub={totals?.messages.failed ? `${totals.messages.failed} failed` : "no failures"}
              onClick={() => setMetric((m) => (m === "dm" ? null : "dm"))}
              active={metric === "dm"}
              dimmed={metric !== null && metric !== "dm"}
              ringClass={METRIC_COLOR.dm.ring}
            />
            <StatCard
              label="Link clicks"
              value={totals?.links.clicks ?? 0}
              sub={`${totals?.links.uniqueClicks ?? 0} unique`}
              onClick={() => setMetric((m) => (m === "click" ? null : "click"))}
              active={metric === "click"}
              dimmed={metric !== null && metric !== "click"}
              ringClass={METRIC_COLOR.click.ring}
            />
            <StatCard label="Conversations" value={totals?.conversations ?? 0} sub={`CTR ${pct(totals?.links.ctr)}`} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {/* Activity chart */}
            <div className="card card-pad lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold">Activity over time</h3>
                {metric && (
                  <button className="text-xs font-semibold text-muted-light hover:text-ink-light dark:text-muted-dark dark:hover:text-ink-dark" onClick={() => setMetric(null)}>
                    Show all
                  </button>
                )}
              </div>
              <ActivityChart series={data.series} metric={metric} onToggleMetric={(m) => setMetric((cur) => (cur === m ? null : m))} />
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

function ActivityChart({
  series,
  metric,
  onToggleMetric,
}: {
  series: { day: string; kind: string; n: number }[];
  metric: Metric | null;
  onToggleMetric: (m: Metric) => void;
}) {
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
  const stackedMax = Math.max(1, ...list.map(([, v]) => v.exec + v.dm + v.click));
  // Isolated view rescales to that metric's own range so a single quiet
  // series doesn't look flat next to the combined total.
  const isolatedMax = metric ? Math.max(1, ...list.map(([, v]) => v[metric])) : stackedMax;

  if (list.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-light dark:text-muted-dark">No activity in this period.</p>;
  }

  const LEGEND: { key: Metric; label: string }[] = [
    { key: "dm", label: "DMs sent" },
    { key: "click", label: "Clicks" },
    { key: "exec", label: "Triggers" },
  ];

  return (
    <div className="overflow-x-auto">
      <div className="flex h-40 items-end gap-2">
        {list.map(([day, v]) => (
          <div key={day} className="group flex min-w-6 flex-1 flex-col items-center gap-1">
            <div className="flex h-32 w-full flex-col justify-end gap-px">
              {metric ? (
                <div
                  className={`${METRIC_COLOR[metric].bar} rounded-sm transition-all group-hover:opacity-80`}
                  style={{ height: `${Math.max(2, (v[metric] / isolatedMax) * 100)}%` }}
                  title={`${v[metric]} ${LEGEND.find((l) => l.key === metric)?.label}`}
                />
              ) : (
                <>
                  <div className={`${METRIC_COLOR.dm.bar} rounded-t-sm transition-all group-hover:opacity-80`} style={{ height: `${Math.max(2, (v.dm / stackedMax) * 100)}%` }} title={`${v.dm} DMs`} />
                  <div className={`${METRIC_COLOR.click.bar} transition-all group-hover:opacity-80`} style={{ height: `${Math.max(2, (v.click / stackedMax) * 100)}%` }} title={`${v.click} clicks`} />
                  <div className={`${METRIC_COLOR.exec.bar} rounded-b-sm transition-all group-hover:opacity-80`} style={{ height: `${Math.max(2, (v.exec / stackedMax) * 100)}%` }} title={`${v.exec} triggers`} />
                </>
              )}
            </div>
            <span className="text-[10px] text-muted-light dark:text-muted-dark">{day.slice(5)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-[11px]">
        {LEGEND.map((l) => (
          <button
            key={l.key}
            onClick={() => onToggleMetric(l.key)}
            className={`flex items-center gap-1.5 rounded transition-opacity ${
              metric && metric !== l.key ? "opacity-40 hover:opacity-70" : "opacity-100"
            } text-muted-light hover:text-ink-light dark:text-muted-dark dark:hover:text-ink-dark`}
          >
            <span className={`h-2 w-2 rounded-sm ${METRIC_COLOR[l.key].dot}`} /> {l.label}
          </button>
        ))}
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
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-line-light dark:bg-line-dark">
              <div className={`h-full rounded-full ${i === 0 ? "bg-ink-light dark:bg-ink-dark" : i === 1 ? "bg-accent" : "bg-success"}`} style={{ width: `${Math.max(6, (s.value / max) * 100)}%` }} />
            </div>
            {s.rate !== null && <span className="w-10 text-right text-[10px] tabular-nums text-muted-light dark:text-muted-dark">{pct(s.rate)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}