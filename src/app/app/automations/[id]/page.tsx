"use client";

// Automation builder: Trigger → Conditions → Actions in a simple, readable
// vertical path. Editable inline; add/remove/reorder nodes; dry-run "Test".

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown, MousePointerClick, MessageSquare, CornerDownRight, Filter, MessageSquareText, Link2, SquarePen,
  Tag, Globe, Clock3, Plus, Trash2, GripVertical, Zap, TestTube2, Save, ArrowLeft, Download, Sparkles,
} from "lucide-react";
import { api, getActiveWorkspace } from "@/lib/client";
import { StatusBadge, PageHeader, Toggle, Spinner, useToast, Modal } from "@/components/ui/ui";
import { AutomationFlow, fmtDelay, conditionLabel, actionLabelAndPreview } from "@/components/automation-flow";

type TriggerType = "COMMENT" | "DM" | "STORY_REPLY";

interface ConditionDraft {
  id: string;
  kind: "KEYWORD_MATCH" | "EXCLUDE_KEYWORDS" | "POST_MATCH" | "FOLLOWERS_ONLY";
  config: Record<string, unknown>;
  enabled: boolean;
}

interface ActionDraft {
  id: string;
  kind: "SEND_DM" | "SEND_LINK" | "PUBLIC_REPLY" | "ADD_TAG" | "CALL_WEBHOOK" | "DELAY";
  config: Record<string, unknown>;
  enabled: boolean;
  delayMs: number;
}

const uid = () => Math.random().toString(36).slice(2, 9);

const TRIGGERS: { value: TriggerType; icon: React.ElementType; label: string; hint: string }[] = [
  { value: "COMMENT", icon: MousePointerClick, label: "Comment", hint: "Someone comments on your posts" },
  { value: "DM", icon: MessageSquare, label: "DM", hint: "Someone messages your account" },
  { value: "STORY_REPLY", icon: CornerDownRight, label: "Story reply", hint: "Someone replies to a story" },
];

const VARIABLES_HELP = [
  ["{{username}}", "commenter / sender handle"],
  ["{{name}}", "display name when known"],
  ["{{comment}}", "the triggering text"],
  ["{{keyword}}", "the keyword that matched"],
  ["{{link}}", "the tracked link URL"],
  ["{{workspace}}", "workspace name"],
].map(([v, d]) => ({ v: v!, d: d! }));

type Validator = (form: Record<string, unknown>) => string | null;

const ACTION_TYPES: { kind: ActionDraft["kind"]; icon: React.ElementType; label: string; hint: string; validate: Validator }[] = [
  { kind: "SEND_DM", icon: MessageSquareText, label: "Send DM", hint: "Private message with variables + CTA buttons", validate: (f) => (String(f.text ?? "").trim() ? null : "Message template is required") },
  { kind: "SEND_LINK", icon: Link2, label: "Send tracked link", hint: "DM with a tracked redirect link", validate: (f) => (String(f.linkDestination ?? "").trim() ? null : "Destination URL is required") },
  { kind: "PUBLIC_REPLY", icon: SquarePen, label: "Public reply", hint: "Reply to the comment publicly", validate: (f) => (String(f.text ?? "").trim() ? null : "Reply text is required") },
  { kind: "ADD_TAG", icon: Tag, label: "Tag contact", hint: "Add a CRM tag to the contact", validate: (f) => (String(f.tag ?? "").trim() ? null : "Tag name is required") },
  { kind: "CALL_WEBHOOK", icon: Globe, label: "Webhook", hint: "POST structured data to your stack (n8n, Make, custom CRM)", validate: (f) => /^https?:\/\//.test(String(f.url ?? "")) ? null : "Valid https URL required" },
  { kind: "DELAY", icon: Clock3, label: "Wait", hint: "Pause before the next action (platform rules permitting)", validate: () => null },
];

const CONDITION_TYPES: { kind: ConditionDraft["kind"]; label: string; hint: string }[] = [
  { kind: "KEYWORD_MATCH", label: "Keyword matches", hint: "Text contains one or more keywords" },
  { kind: "EXCLUDE_KEYWORDS", label: "Exclude keywords", hint: "Skip when text contains these" },
  { kind: "POST_MATCH", label: "Specific post", hint: "Only comments on a chosen post" },
  { kind: "FOLLOWERS_ONLY", label: "Followers only", hint: "Requires follower status (needs advanced Meta access)" },
];

export default function BuilderPage() {
  const params = useParams<{ id?: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const editing = Boolean(params.id);
  const ws = getActiveWorkspace();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState<TriggerType>("COMMENT");
  const [triggerFollowerGate, setTriggerFollowerGate] = useState(false);
  const [conditions, setConditions] = useState<ConditionDraft[]>([]);
  const [actions, setActions] = useState<ActionDraft[]>([]);
  const [status, setStatus] = useState("DRAFT");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!editing);
  const [showAddAction, setShowAddAction] = useState(false);
  const [showAddCondition, setShowAddCondition] = useState(false);
  const [testResult, setTestResult] = useState<{ pass: boolean; reason: string | null; steps: { kind: string; preview: string }[]; checks: { label: string; ok: boolean; detail: string }[] } | null>(null);
  const [testing, setTesting] = useState(false);
  const [showTest, setShowTest] = useState(searchParams.get("test") === "1");
  const [showAi, setShowAi] = useState(false);
  const [aiSituation, setAiSituation] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  // Load existing automation for edit mode.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!editing || !ws) return;
    api<{ automation: any }>(`/api/workspaces/${ws}/automations/${params.id}`)
      .then(({ automation }) => {
        setName(automation.name);
        setDescription(automation.description ?? "");
        setTrigger(automation.triggerType);
        const tc = (automation.triggerConfig ?? {}) as Record<string, unknown>;
        setTriggerFollowerGate(Boolean(tc.followerGate));
        setConditions(
          (automation.conditions ?? []).map((c: any) => ({
            id: uid(),
            kind: c.kind,
            config: (c.config ?? {}) as Record<string, unknown>,
            enabled: c.enabled,
          })),
        );
        setActions(
          (automation.actions ?? []).map((a: any) => ({
            id: uid(),
            kind: a.kind,
            config: (a.config ?? {}) as Record<string, unknown>,
            enabled: a.enabled,
            delayMs: a.delayMs ?? 0,
          })),
        );
        setStatus(automation.status);
        setLoaded(true);
      })
      .catch((e) => {
        toast("error", e instanceof Error ? e.message : "Failed to load automation");
        router.push("/app/automations");
      });
  }, [editing, params.id, ws]);

  const payload = useMemo(
    () => ({
      name: name.trim() || "Untitled automation",
      description: description.trim() || null,
      triggerType: trigger,
      triggerConfig: { followerGate: triggerFollowerGate },
      conditions: conditions.map((c, i) => ({ kind: c.kind, config: c.config as object, order: i, enabled: c.enabled })),
      actions: actions.map((a, i) => ({ kind: a.kind, config: a.config as object, order: i, enabled: a.enabled, delayMs: a.delayMs })),
    }),
    [name, description, trigger, triggerFollowerGate, conditions, actions],
  );

  const validationError = useMemo(() => {
    if (!name.trim()) return "Give the automation a name";
    if (actions.length === 0) return "Add at least one action";
    for (const a of actions) {
      const def = ACTION_TYPES.find((t) => t.kind === a.kind);
      const err = def?.validate(a.config);
      if (err) return `“${def?.label}”: ${err}`;
    }
    for (const c of conditions) {
      if (c.kind === "KEYWORD_MATCH" && !((c.config.keywords as string[] | undefined) ?? []).length) return "Keyword condition needs at least one keyword";
      if (c.kind === "EXCLUDE_KEYWORDS" && !((c.config.keywords as string[] | undefined) ?? []).length) return "Exclude condition needs at least one keyword";
      if (c.kind === "POST_MATCH" && c.config.postSelection === "specific" && !c.config.postRef) return "Pick a post for the post condition";
    }
    return null;
  }, [name, conditions, actions]);

  const save = async (activate = false) => {
    if (validationError) {
      toast("error", validationError);
      return;
    }
    setSaving(true);
    try {
      const path = editing ? `/api/workspaces/${ws}/automations/${params.id}` : `/api/workspaces/${ws}/automations`;
      const res = await api<{ automation: { id: string } }>(path, {
        method: editing ? "PATCH" : "POST",
        body: payload,
      });
      if (activate) {
        await api(`/api/workspaces/${ws}/automations/${res.automation.id}/status`, { method: "PATCH", body: { status: "ACTIVE" } });
        toast("success", "Automation saved and activated 🎉");
      } else {
        toast("success", editing ? "Automation saved" : "Automation created");
      }
      router.push(`/app/automations/${res.automation.id}`);
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (!editing) {
      // Save first so the test runs against real config.
      try {
        const res = await api<{ automation: { id: string } }>(`/api/workspaces/${ws}/automations`, { method: "POST", body: payload });
        router.replace(`/app/automations/${res.automation.id}?test=1`);
        return;
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Save failed");
        return;
      }
    }
    setTesting(true);
    try {
      const res = await api<typeof testResult>(`/api/workspaces/${ws}/automations/${params.id}/test`, {
        method: "POST",
        body: { text: "GUIDE", isFollower: true, insideWindow: true },
      });
      setTestResult(res);
      setShowTest(true);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const aiGenerate = async () => {
    if (!aiSituation.trim()) return;
    setAiBusy(true);
    try {
      const draft = await api<any>(`/api/workspaces/${ws}/ai`, { method: "POST", body: { feature: "campaign", situation: aiSituation } });
      setName(draft.name ?? name);
      setDescription(draft.description ?? "");
      setTrigger(draft.triggerType ?? "COMMENT");
      setTriggerFollowerGate(Boolean(draft.triggerConfig?.followerGate));
      setConditions(
        (draft.conditions ?? []).map((c: any) => ({
          id: uid(),
          kind: c.kind,
          config: c.config ?? {},
          enabled: c.enabled !== false,
        })),
      );
      setActions(
        (draft.actions ?? []).map((a: any) => ({
          id: uid(),
          kind: a.kind,
          config: a.config ?? {},
          enabled: a.enabled !== false,
          delayMs: a.delayMs ?? 0,
        })),
      );
      setShowAi(false);
      setAiSituation("");
      toast("success", "AI draft ready — review it before activating");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "AI generation failed");
    } finally {
      setAiBusy(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const addAction = (kind: ActionDraft["kind"]) => {
    const base: Record<string, unknown> = {};
    if (kind === "SEND_DM") base.text = "Hey {{username}}! 👋";
    if (kind === "SEND_LINK") base.text = "Here you go: {{link}}";
    if (kind === "PUBLIC_REPLY") base.text = "Sent it 👊";
    if (kind === "ADD_TAG") base.tag = "New Lead";
    if (kind === "CALL_WEBHOOK") base.url = "";
    if (kind === "DELAY") base.ms = 3600000;
    setActions((prev) => [...prev, { id: uid(), kind, config: base, enabled: true, delayMs: kind === "DELAY" ? 0 : 0 }]);
    setShowAddAction(false);
  };

  const addCondition = (kind: ConditionDraft["kind"]) => {
    const base: Record<string, unknown> =
      kind === "KEYWORD_MATCH" ? { keywords: [""], matchAny: false, caseInsensitive: true, wholeWord: true }
      : kind === "EXCLUDE_KEYWORDS" ? { keywords: [""], matchAny: true, caseInsensitive: true, wholeWord: true }
      : kind === "POST_MATCH" ? { postSelection: "any", postRef: null }
      : { requireFollow: true };
    setConditions((prev) => [...prev, { id: uid(), kind, config: base, enabled: true }]);
    setShowAddCondition(false);
  };

  const move = (list: { id: string }[], setId: (v: any[]) => void, id: string, dir: -1 | 1) => {
    const idx = list.findIndex((x) => x.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= list.length) return;
    const next = [...list];
    const a = next[idx];
    const b = next[target];
    if (a === undefined || b === undefined) return;
    next[idx] = b;
    next[target] = a;
    setId(next);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={editing ? name || "Automation" : "New automation"}
        description={editing ? undefined : "Describe the trigger, set conditions, chain actions. Review the flow at a glance."}
        actions={
          <>
            {editing && <StatusBadge status={status} />}
            <button className="btn-secondary" onClick={() => router.push("/app/automations")}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button className="btn-secondary" onClick={runTest} disabled={testing}>
              <TestTube2 className="h-4 w-4" /> {testing ? "Running…" : "Test"}
            </button>
            <button className="btn-secondary" onClick={() => setShowAi(true)}>
              <Sparkles className="h-4 w-4 text-accent" /> AI
            </button>
            <button className="btn-ghost" onClick={() => save()} disabled={saving}>
              <Save className="h-4 w-4" /> Save
            </button>
            <button className="btn-primary" onClick={() => save(true)} disabled={saving}>
              {saving ? <Spinner /> : <Zap className="h-4 w-4" />} Save & activate
            </button>
          </>
        }
      />

      {/* Name */}
      <div className="card mb-4 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="auto-name" className="label">Automation name</label>
            <input id="auto-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Comment GUIDE → DM checklist" />
          </div>
          <div>
            <label htmlFor="auto-desc" className="label">Description (optional)</label>
            <input id="auto-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this do?" />
          </div>
        </div>
      </div>

      <AutomationFlow
        automation={{
          name,
          triggerType: trigger,
          triggerLabel: triggerHint(trigger),
          conditions: conditions.map((c) => ({ ...conditionLabel(c.kind, c.config), kind: c.kind, enabled: c.enabled })),
          actions: actions.map((a) => ({ ...actionLabelAndPreview(a), kind: a.kind, delayMs: a.delayMs, enabled: a.enabled })),
        }}
      />

      {/* Builder path */}
      <div className="mt-6 space-y-4">
        {/* Trigger */}
        <section className="card p-5">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">Trigger</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {TRIGGERS.map((t) => {
              const Icon = t.icon;
              const active = trigger === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setTrigger(t.value)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    active ? "border-accent bg-accent/5 ring-1 ring-accent/30" : "border-line-light hover:border-muted-light/50 dark:border-line-dark"
                  }`}
                >
                  <Icon className={`mb-2 h-5 w-5 ${active ? "text-accent" : "text-muted-light dark:text-muted-dark"}`} />
                  <p className="text-sm font-bold">{t.label}</p>
                  <p className="mt-0.5 text-xs text-muted-light dark:text-muted-dark">{t.hint}</p>
                </button>
              );
            })}
          </div>
          <label className="mt-4 flex items-center gap-2.5 text-sm">
            <Toggle checked={triggerFollowerGate} onChange={setTriggerFollowerGate} label="Followers only" />
            Followers only
            <span className="text-xs text-muted-light dark:text-muted-dark">— skips non-followers (requires Meta advanced access to enforce)</span>
          </label>
        </section>

        {/* Conditions */}
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">
              Conditions <span className="ml-1 font-normal normal-case">— all must pass</span>
            </h3>
            <button className="btn-secondary !py-1 text-xs" onClick={() => setShowAddCondition(true)}>
              <Plus className="h-3.5 w-3.5" /> Add condition
            </button>
          </div>

          {conditions.length === 0 && (
            <p className="rounded-lg bg-canvas-light px-3 py-2.5 text-xs text-muted-light dark:bg-canvas-dark dark:text-muted-dark">
              No conditions — this automation runs on every {triggerHint(trigger).toLowerCase()}. Add keyword matching to be precise.
            </p>
          )}

          {conditions.map((c, i) => (
            <ConditionEditor key={c.id} condition={c} index={i} total={conditions.length} onChange={(patch) => setConditions((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...patch } : x)))} onMove={(dir) => move(conditions, setConditions, c.id, dir)} onRemove={() => setConditions((prev) => prev.filter((x) => x.id !== c.id))} />
          ))}
        </section>

        {/* Actions */}
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">Actions — run in order</h3>
            <button className="btn-secondary !py-1 text-xs" onClick={() => setShowAddAction(true)}>
              <Plus className="h-3.5 w-3.5" /> Add action
            </button>
          </div>
          {actions.length === 0 && (
            <p className="rounded-lg bg-canvas-light px-3 py-2.5 text-xs text-muted-light dark:bg-canvas-dark dark:text-muted-dark">
              No actions yet. Typical flows: public reply → send DM with tracked link → tag the contact.
            </p>
          )}
          {actions.map((a, i) => (
            <ActionEditor key={a.id} action={a} index={i} total={actions.length} onChange={(patch) => setActions((prev) => prev.map((x) => (x.id === a.id ? { ...x, ...patch } : x)))} onMove={(dir) => move(actions, setActions, a.id, dir)} onRemove={() => setActions((prev) => prev.filter((x) => x.id !== a.id))} />
          ))}
        </section>
      </div>

      {/* Variables help */}
      <div className="mt-4">
        <details className="card p-4">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">Message variables</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {VARIABLES_HELP.map((v) => (
              <p key={v.v} className="text-xs">
                <code className="rounded bg-canvas-light px-1.5 py-0.5 font-mono text-[11px] dark:bg-canvas-dark">{v.v}</code> <span className="text-muted-light dark:text-muted-dark">— {v.d}</span>
              </p>
            ))}
          </div>
        </details>
      </div>

      {/* Add action modal */}
      <Modal open={showAddAction} onClose={() => setShowAddAction(false)} title="Add action">
        <div className="space-y-1.5">
          {ACTION_TYPES.map((t) => (
            <button key={t.kind} className="flex w-full items-start gap-3 rounded-xl border border-line-light p-3 text-left transition-colors hover:border-accent/40 dark:border-line-dark" onClick={() => addAction(t.kind)}>
              <t.icon className="mt-0.5 h-4 w-4 text-accent" />
              <span>
                <span className="block text-sm font-bold">{t.label}</span>
                <span className="block text-xs text-muted-light dark:text-muted-dark">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Add condition modal */}
      <Modal open={showAddCondition} onClose={() => setShowAddCondition(false)} title="Add condition">
        <div className="space-y-1.5">
          {CONDITION_TYPES.map((t) => (
            <button key={t.kind} className="flex w-full items-start gap-3 rounded-xl border border-line-light p-3 text-left transition-colors hover:border-accent/40 dark:border-line-dark" onClick={() => addCondition(t.kind)}>
              <Filter className="mt-0.5 h-4 w-4 text-amber-500" />
              <span>
                <span className="block text-sm font-bold">{t.label}</span>
                <span className="block text-xs text-muted-light dark:text-muted-dark">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Test results */}
      <Modal open={showTest} onClose={() => setShowTest(false)} title="Test run" wide>
        {!testResult ? (
          <p className="text-sm text-muted-light dark:text-muted-dark">Run the test to see how this automation evaluates a simulated event.</p>
        ) : (
          <div className="space-y-4">
            <div className={`rounded-xl border p-4 ${testResult.pass ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10"}`}>
              <p className="text-sm font-bold">{testResult.pass ? "✅ Would run" : "⛔ Would skip"}</p>
              {testResult.reason && <p className="mt-1 text-xs text-muted-light dark:text-muted-dark">{testResult.reason}</p>}
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">Checks</p>
              <div className="space-y-1.5">
                {testResult.checks.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-canvas-light px-3 py-2 text-xs dark:bg-canvas-dark">
                    <span className={c.ok ? "text-emerald-600" : "text-red-500"}>{c.ok ? "✓" : "✗"}</span>
                    <span className="font-semibold">{c.label}</span>
                    <span className="text-muted-light dark:text-muted-dark">— {c.detail}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">Actions that would run</p>
              <div className="space-y-1.5">
                {testResult.steps.length === 0 && <p className="text-xs text-muted-light dark:text-muted-dark">No actions configured.</p>}
                {testResult.steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-canvas-light px-3 py-2 dark:bg-canvas-dark">
                    <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold dark:bg-surface-dark">{s.kind.replace("_", " ")}</span>
                    <p className="truncate text-xs">{s.preview || "—"}</p>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-muted-light dark:text-muted-dark">This is a dry run — nothing was sent. Note: DM actions also respect Instagram&apos;s 7-day messaging window at send time.</p>
          </div>
        )}
      </Modal>

      {/* AI modal */}
      <Modal open={showAi} onClose={() => setShowAi(false)} title="Generate with AI">
        <div className="space-y-4">
          <p className="text-sm text-muted-light dark:text-muted-dark">Describe the campaign in plain language. The draft is a starting point — you review everything before saving.</p>
          <div>
            <label htmlFor="ai-situation" className="label">Your campaign</label>
            <textarea id="ai-situation" className="input min-h-24" placeholder='e.g. "I have a reel offering my SEO checklist. People comment GUIDE."' value={aiSituation} onChange={(e) => setAiSituation(e.target.value)} />
          </div>
          <button className="btn-primary w-full" onClick={aiGenerate} disabled={aiBusy || !aiSituation.trim()}>
            {aiBusy ? <Spinner /> : <Sparkles className="h-4 w-4" />} Generate draft
          </button>
          <p className="text-[11px] text-muted-light dark:text-muted-dark">Requires AI_PROVIDER + API key in .env. Generation is never sent to your contacts without your approval.</p>
        </div>
      </Modal>
    </div>
  );
}

function triggerHint(t: TriggerType): string {
  return TRIGGERS.find((x) => x.value === t)?.label ?? t;
}

// ── Condition editor ──────────────────────────────────────────────────────

function ConditionEditor({
  condition: c, index, total, onChange, onMove, onRemove,
}: {
  condition: ConditionDraft;
  index: number;
  total: number;
  onChange: (patch: Partial<ConditionDraft>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className={`mb-2.5 flex items-start gap-3 rounded-xl border border-line-light p-3.5 dark:border-line-dark ${c.enabled ? "" : "opacity-50"}`}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
        <Filter className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold">{CONDITION_TYPES.find((t) => t.kind === c.kind)?.label}</p>
          <div className="flex items-center gap-1">
            <Toggle checked={c.enabled} onChange={(v) => onChange({ enabled: v })} label="Enabled" />
            <button className="btn-ghost !p-1.5" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up"><ArrowDown className="h-3.5 w-3.5 rotate-180" /></button>
            <button className="btn-ghost !p-1.5" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
            <button className="btn-ghost !p-1.5 !text-red-500" onClick={onRemove} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        {c.kind === "KEYWORD_MATCH" || c.kind === "EXCLUDE_KEYWORDS" ? (
          <KeywordFields keywords={(c.config.keywords as string[]) ?? [""]} onChangeKeywords={(keywords) => onChange({ config: { ...c.config, keywords } })} />
        ) : c.kind === "POST_MATCH" ? (
          <div className="flex flex-wrap items-center gap-3">
            <select className="input !w-auto !py-1.5 text-xs" value={String(c.config.postSelection ?? "any")} onChange={(e) => onChange({ config: { ...c.config, postSelection: e.target.value, postRef: e.target.value === "any" ? null : c.config.postRef } })}>
              <option value="any">Any post</option>
              <option value="specific">Specific post</option>
            </select>
            {c.config.postSelection === "specific" && (
              <input className="input !w-64 !py-1.5 text-xs" placeholder="Instagram media ID or URL" value={String(c.config.postRef ?? "")} onChange={(e) => onChange({ config: { ...c.config, postRef: e.target.value } })} />
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-light dark:text-muted-dark">
            Skips non-followers. Follower status requires Meta advanced access — without it this condition fails closed (never runs).
          </p>
        )}
      </div>
    </div>
  );
}

function KeywordFields({ keywords, onChangeKeywords }: { keywords: string[]; onChangeKeywords: (k: string[]) => void }) {
  const update = (i: number, v: string) => {
    const next = [...keywords];
    next[i] = v;
    onChangeKeywords(next);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {keywords.map((k, i) => (
        <input
          key={i}
          className="input !w-36 !py-1.5 text-xs"
          placeholder={`keyword ${i + 1}`}
          value={k}
          onChange={(e) => update(i, e.target.value)}
        />
      ))}
      <button className="btn-ghost !p-1.5 text-xs" onClick={() => onChangeKeywords([...keywords, ""])}>
        <Plus className="h-3 w-3" /> add
      </button>
    </div>
  );
}

// ── Action editor ─────────────────────────────────────────────────────────

function ActionEditor({
  action: a, index, total, onChange, onMove, onRemove,
}: {
  action: ActionDraft;
  index: number;
  total: number;
  onChange: (patch: Partial<ActionDraft>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [ctas, setCtas] = useState<{ title: string; payload?: string }[]>((a.config.ctaButtons as { title: string; payload?: string }[]) ?? []);
  const set = (patch: Record<string, unknown>) => onChange({ config: { ...a.config, ...patch } });

  return (
    <div className={`mb-2.5 rounded-xl border border-line-light p-3.5 dark:border-line-dark ${a.enabled ? "" : "opacity-50"}`}>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <GripVertical className="h-4 w-4 text-muted-light/50 dark:text-muted-dark/50" aria-hidden />
          <span className="rounded-md bg-canvas-light px-2 py-0.5 font-mono text-[11px] font-bold text-ink-light dark:bg-canvas-dark dark:text-ink-dark">{index + 1}</span>
          <p className="text-sm font-bold">{ACTION_TYPES.find((t) => t.kind === a.kind)?.label}</p>
          {a.delayMs > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-500/10 dark:text-slate-400">
              <Clock3 className="h-3 w-3" /> waits {fmtDelay(a.delayMs)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Toggle checked={a.enabled} onChange={(v) => onChange({ enabled: v })} label="Enabled" />
          <button className="btn-ghost !p-1.5" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up"><ArrowDown className="h-3.5 w-3.5 rotate-180" /></button>
          <button className="btn-ghost !p-1.5" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
          <button className="btn-ghost !p-1.5 !text-red-500" onClick={onRemove} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div className="space-y-2.5 pl-9">
        {(a.kind === "SEND_DM" || a.kind === "SEND_LINK" || a.kind === "PUBLIC_REPLY") && (
          <div>
            {a.kind !== "PUBLIC_REPLY" && (
              <label htmlFor={`action-${a.id}-text`} className="label">Message template</label>
            )}
            <textarea
              id={`action-${a.id}-text`}
              className="input min-h-16"
              value={String(a.config.text ?? "")}
              onChange={(e) => set({ text: e.target.value })}
              placeholder={a.kind === "PUBLIC_REPLY" ? "Public reply text" : "e.g. Hey {{username}}, here's your guide: {{link}}"}
            />
          </div>
        )}

        {a.kind === "SEND_LINK" && (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div>
              <label className="label">Destination URL</label>
              <input className="input" type="url" value={String(a.config.linkDestination ?? "")} onChange={(e) => set({ linkDestination: e.target.value })} placeholder="https://your-site.com/checklist" />
            </div>
            <div>
              <label className="label">Link name (tracking)</label>
              <input className="input" value={String(a.config.linkName ?? "")} onChange={(e) => set({ linkName: e.target.value })} placeholder="SEO checklist" />
            </div>
          </div>
        )}

        {(a.kind === "SEND_DM" || a.kind === "SEND_LINK") && (
          <div>
            <label className="label">CTA buttons (up to 3)</label>
            <div className="space-y-1.5">
              {ctas.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="input !py-1.5 text-xs" value={c.title} onChange={(e) => { const next = ctas.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)); setCtas(next); onChange({ config: { ...a.config, ctaButtons: next } }); }} placeholder={`Button ${i + 1} label`} />
                  <button className="btn-ghost !p-1.5 !text-red-500" onClick={() => { const next = ctas.filter((_, j) => j !== i); setCtas(next); onChange({ config: { ...a.config, ctaButtons: next } }); }} aria-label="Remove button"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {ctas.length < 3 && (
                <button className="btn-ghost text-xs" onClick={() => { const next = [...ctas, { title: "" }]; setCtas(next); onChange({ config: { ...a.config, ctaButtons: next } }); }}>
                  <Plus className="h-3 w-3" /> Add button
                </button>
              )}
            </div>
          </div>
        )}

        {a.kind === "ADD_TAG" && (
          <div>
            <label className="label">Tag name</label>
            <input className="input !w-64" value={String(a.config.tag ?? "")} onChange={(e) => set({ tag: e.target.value })} placeholder="Guide Lead" />
          </div>
        )}

        {a.kind === "CALL_WEBHOOK" && (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Webhook URL (https)</label>
              <input className="input" type="url" value={String(a.config.url ?? "")} onChange={(e) => set({ url: e.target.value })} placeholder="https://n8n.example.com/webhook/leonyx" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Signing secret (optional — HMAC-SHA256 header)</label>
              <input className="input" type="password" value={String(a.config.secret ?? "")} onChange={(e) => set({ secret: e.target.value })} placeholder="shared secret" />
            </div>
            <p className="sm:col-span-2 text-[11px] text-muted-light dark:text-muted-dark">
              Delivered with retries, an X-Leonyx-Signature header and a persisted delivery log. Never logged.
            </p>
          </div>
        )}

        {a.kind === "DELAY" && (
          <div>
            <label className="label">Wait time</label>
            <select className="input !w-64" value={String(a.config.ms ?? 3600000)} onChange={(e) => set({ ms: Number(e.target.value) })}>
              <option value={0}>No delay</option>
              <option value={300000}>5 minutes</option>
              <option value={1800000}>30 minutes</option>
              <option value={3600000}>1 hour</option>
              <option value={21600000}>6 hours</option>
              <option value={86400000}>24 hours</option>
            </select>
            <p className="mt-1.5 text-[11px] text-muted-light dark:text-muted-dark">Delays schedule the next action in the background queue — safe across restarts.</p>
          </div>
        )}
      </div>
    </div>
  );
}