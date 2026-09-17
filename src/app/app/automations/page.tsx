"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, MoreHorizontal, Power, Copy, Archive, Download, Upload, Workflow, TestTube2, Wand2 } from "lucide-react";
import { api, ApiError, getActiveWorkspace } from "@/lib/client";
import { StatusBadge, PageHeader, EmptyState, Skeleton, ConfirmDialog, useToast } from "@/components/ui/ui";
import { AutomationFlow, actionLabelAndPreview, conditionLabel } from "@/components/automation-flow";

interface AutomationRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  triggerType: string;
  updatedAt: string;
  actions: { kind: string; config: Record<string, unknown>; enabled: boolean; order: number; delayMs: number }[];
  conditions: { kind: string; config: Record<string, unknown>; enabled: boolean; order: number }[];
  _count: { executions: number };
}

interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  triggerLabel: string;
  actionCount: number;
}

export default function AutomationsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [items, setItems] = useState<AutomationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [menu, setMenu] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "archive" | "toggle"; id: string; to?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<TemplateMeta[] | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    const ws = getActiveWorkspace();
    if (!ws) return;
    try {
      const res = await api<{ items: AutomationRow[] }>(`/api/workspaces/${ws}/automations?status=${statusFilter}`);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [statusFilter]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (params.get("new") === "1") setShowTemplates(true);
  }, [params]);

  // Load template catalog lazily when the modal opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (showTemplates && !templates && !importing) {
      const ws = getActiveWorkspace();
      if (!ws) return;
      api<{ templates: TemplateMeta[] }>(`/api/workspaces/${ws}/templates`)
        .then((res) => setTemplates(res.templates))
        .catch(() => setTemplates([]));
    }
  }, [showTemplates, templates, importing]);

  const toggle = async (id: string) => {
    const a = items?.find((x) => x.id === id);
    if (!a) return;
    const to = a.status === "ACTIVE" ? "PAUSED" : a.status === "DRAFT" || a.status === "PAUSED" ? "ACTIVE" : null;
    if (!to) return;
    setBusy(true);
    try {
      await api(`/api/workspaces/${getActiveWorkspace()}/automations/${a.id}/status`, { method: "PATCH", body: { status: to } });
      toast("success", to === "ACTIVE" ? `"${a.name}" is now live` : `"${a.name}" paused`);
      load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const archive = async (id: string) => {
    setBusy(true);
    try {
      await api(`/api/workspaces/${getActiveWorkspace()}/automations/${id}`, { method: "DELETE" });
      toast("success", "Automation archived");
      load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const duplicate = async (id: string) => {
    try {
      const res = await api<{ automation: { id: string } }>(`/api/workspaces/${getActiveWorkspace()}/automations/${id}/duplicate`, { method: "POST", body: {} });
      toast("success", "Duplicated as a draft");
      router.push(`/app/automations/${res.automation.id}`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed");
    }
  };

  const exportJson = async (a: AutomationRow) => {
    try {
      const res = await fetch(`/api/workspaces/${getActiveWorkspace()}/automations/${a.id}/export`, { credentials: "include" });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-automation.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast("success", "Exported");
    } catch {
      toast("error", "Export failed");
    }
  };

  const importJson = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await api(`/api/workspaces/${getActiveWorkspace()}/automations/import`, { method: "POST", body: { payload } });
      toast("success", "Automation imported");
      setShowTemplates(false);
      load();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Invalid automation file";
      toast("error", msg);
    } finally {
      setImporting(false);
    }
  };

  const openTemplates = () => {
    setShowTemplates(true);
  };

  return (
    <div>
      <PageHeader
        title="Automations"
        description="Every activation is an EVENT → CONDITIONS → ACTIONS workflow. Toggle one on and Instagram events start flowing."
        actions={
          <>
            <button className="btn-secondary" onClick={() => { setShowTemplates(false); setImporting(false); const el = document.getElementById("import-file") as HTMLInputElement; el?.click(); }}>
              <Upload className="h-4 w-4" /> Import
            </button>
            <input
              id="import-file"
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
            />
            <button className="btn-primary" onClick={() => router.push("/app/automations/new")}>
              <Plus className="h-4 w-4" /> New automation
            </button>
          </>
        }
      />

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">{error}</p>}

      {/* Status filter */}
      <div className="mb-4 flex gap-1.5">
        {["ALL", "ACTIVE", "DRAFT", "PAUSED", "ARCHIVED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              statusFilter === s ? "bg-ink-light text-white dark:bg-ink-dark dark:text-ink-light" : "bg-white text-muted-light hover:text-ink-light dark:bg-surface-dark dark:text-muted-dark dark:hover:text-ink-dark"
            }`}
          >
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {!items ? (
        <div className="space-y-3">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Workflow className="h-8 w-8" />}
          title={statusFilter === "ALL" ? "No automations yet" : "Nothing here"}
          description={
            statusFilter === "ALL"
              ? "Start from a template or build your first flow: pick a trigger, add conditions and actions."
              : "Automations with this status will appear here."
          }
          action={
            statusFilter === "ALL" ? (
              <button className="btn-primary" onClick={() => router.push("/app/automations/new")}>
                <Wand2 className="h-4 w-4" /> Start from template
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {items.map((a) => (
            <div key={a.id} className="card relative flex flex-col p-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <button className="min-w-0 text-left" onClick={() => router.push(`/app/automations/${a.id}`)}>
                  <h3 className="truncate text-sm font-bold hover:text-accent">{a.name}</h3>
                  {a.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-light dark:text-muted-dark">{a.description}</p>}
                </button>
                <div className="relative">
                  <button className="btn-ghost !p-1.5" onClick={() => setMenu(menu === a.id ? null : a.id)} aria-label="Actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {menu === a.id && (
                    <div className="card absolute right-0 z-20 w-40 !p-1.5 text-sm shadow-pop animate-fade-in">
                      {[
                        { icon: Copy, label: "Duplicate", fn: () => duplicate(a.id) },
                        { icon: Download, label: "Export JSON", fn: () => exportJson(a) },
                        { icon: TestTube2, label: "Test run", fn: () => router.push(`/app/automations/${a.id}?test=1`) },
                        ...(a.status !== "ARCHIVED" ? [{ icon: Archive, label: "Archive", fn: () => setConfirm({ kind: "archive", id: a.id }) }] : []),
                      ].map((m) => (
                        <button
                          key={m.label}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5"
                          onClick={() => {
                            setMenu(null);
                            m.fn();
                          }}
                        >
                          <m.icon className="h-3.5 w-3.5" /> {m.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-3 flex items-center gap-2">
                <StatusBadge status={a.status} />
                <span className="text-[11px] text-muted-light dark:text-muted-dark">{a._count.executions} runs</span>
              </div>

              <div className="flex-1">
                <AutomationFlow
                  compact
                  automation={{
                    name: a.name,
                    triggerType: a.triggerType,
                    triggerLabel: "",
                    conditions: a.conditions.map((c) => ({ ...conditionLabel(c.kind, c.config), kind: c.kind, enabled: c.enabled })),
                    actions: a.actions.map((x) => ({ ...actionLabelAndPreview(x), kind: x.kind, delayMs: x.delayMs, enabled: x.enabled })),
                  }}
                />
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-line-light pt-3 dark:border-line-dark">
                <span className="text-[11px] text-muted-light dark:text-muted-dark">Updated {fmtDate2(a.updatedAt)}</span>
                {a.status !== "ARCHIVED" && (
                  <button
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      a.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-accent/10 text-accent hover:bg-accent/15"
                    }`}
                    onClick={() => (a.status === "ACTIVE" ? setConfirm({ kind: "toggle", id: a.id }) : toggle(a.id))}
                    disabled={busy}
                  >
                    <Power className="h-3 w-3" />
                    {a.status === "ACTIVE" ? "Pause" : "Activate"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Template/import modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowTemplates(false)} />
          <div className="card relative max-h-[80vh] w-full max-w-2xl overflow-y-auto p-6 shadow-pop animate-fade-in">
            <h2 className="mb-1 text-lg font-semibold">Start from a template</h2>
            <p className="mb-4 text-sm text-muted-light dark:text-muted-dark">Templates instantiate as editable drafts — every value is yours to change.</p>
            {!templates ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    className="rounded-xl border border-line-light p-3.5 text-left transition-colors hover:border-accent/40 hover:bg-accent/[0.03] dark:border-line-dark"
                    onClick={async () => {
                      try {
                        await api(`/api/workspaces/${getActiveWorkspace()}/templates/${t.id}`, { method: "POST", body: {} });
                        toast("success", `"${t.name}" created`);
                        setShowTemplates(false);
                        load();
                      } catch (e) {
                        toast("error", e instanceof Error ? e.message : "Failed");
                      }
                    }}
                  >
                    <p className="text-sm font-bold">{t.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-light dark:text-muted-dark">{t.description}</p>
                    <p className="mt-2 text-[11px] font-medium text-accent">
                      {t.triggerLabel} · {t.actionCount} actions
                    </p>
                  </button>
                ))}
              </div>
            )}
            <button className="btn-secondary mt-4 w-full" onClick={() => setShowTemplates(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => (confirm?.kind === "archive" ? archive(confirm.id) : confirm && toggle(confirm.id))}
        title={confirm?.kind === "archive" ? "Archive automation?" : "Pause automation?"}
        description={
          confirm?.kind === "archive"
            ? "The automation stops running and moves to the archive. Executions and history stay intact."
            : "Paused automations stop matching new events. You can re-activate any time."
        }
        confirmLabel={confirm?.kind === "archive" ? "Archive" : "Pause"}
        danger={confirm?.kind === "archive"}
        busy={busy}
      />
    </div>
  );
}

function fmtDate2(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}