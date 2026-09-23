"use client";

// Visual representation of an automation: Trigger → Conditions → Actions.
// Readable in seconds — no node editor required.

import { MousePointerClick, MessageSquare, SquarePen, Hash, Tag, Globe, Clock3, Filter, CornerDownRight, Link2, Check } from "lucide-react";

export interface FlowAction {
  kind: string;
  label: string;
  preview: string;
  delayMs?: number;
  enabled: boolean;
}

export interface FlowAutomation {
  name: string;
  triggerType: string;
  triggerLabel: string;
  conditions: { kind: string; label: string; preview: string; enabled: boolean }[];
  actions: FlowAction[];
}

const TRIGGER_META: Record<string, { icon: React.ElementType; label: string }> = {
  COMMENT: { icon: MousePointerClick, label: "Instagram comment" },
  DM: { icon: MessageSquare, label: "Instagram DM" },
  STORY_REPLY: { icon: CornerDownRight, label: "Story reply" },
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  SEND_DM: MessageSquare,
  SEND_LINK: Link2,
  PUBLIC_REPLY: SquarePen,
  ADD_TAG: Tag,
  CALL_WEBHOOK: Globe,
  DELAY: Clock3,
};

function actionInfo(a: FlowAction) {
  const Icon = ACTION_ICONS[a.kind] ?? Check;
  const color =
    a.kind === "SEND_DM" || a.kind === "SEND_LINK"
      ? "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400"
      : a.kind === "PUBLIC_REPLY"
        ? "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400"
        : a.kind === "ADD_TAG"
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
          : a.kind === "CALL_WEBHOOK"
            ? "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400"
            : a.kind === "DELAY"
              ? "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300"
              : "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300";
  return { Icon, color };
}

export function AutomationFlow({ automation, compact }: { automation: FlowAutomation; compact?: boolean }) {
  const trigger = TRIGGER_META[automation.triggerType] ?? { icon: MousePointerClick, label: "Trigger" };
  const TriggerIcon = trigger.icon;

  return (
    <div className="flow-root">
      <ol className="relative space-y-2.5">
        {/* Vertical connector line */}
        <div aria-hidden className="absolute bottom-4 left-[19px] top-4 w-px bg-line-light dark:bg-line-dark" />

        {/* Trigger node */}
        <li className="relative flex items-start gap-3">
          <div className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-card">
            <TriggerIcon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <p className="text-sm font-semibold">{trigger.label}</p>
            {!compact && <p className="mt-0.5 text-xs text-muted-light dark:text-muted-dark">{automation.triggerLabel}</p>}
          </div>
        </li>

        {/* Conditions */}
        {automation.conditions.map((c, i) => (
          <li key={`c-${i}`} className={`relative flex items-start gap-3 ${c.enabled ? "" : "opacity-50"}`}>
            <div className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20">
              <Filter className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-sm font-semibold">{c.label}</p>
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-light dark:text-muted-dark">{c.preview}</p>
            </div>
          </li>
        ))}

        {/* Actions */}
        {automation.actions
          .filter((a) => a.enabled || compact)
          .map((a, i) => {
            const { Icon, color } = actionInfo(a);
            return (
              <li key={`a-${i}`} className={`relative flex items-start gap-3 ${a.enabled ? "" : "opacity-40"}`}>
                <div className={`z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color} shadow-card`}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-sm font-semibold">{a.label}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-light dark:text-muted-dark">{a.preview}</p>
                  {(a.delayMs ?? 0) > 0 && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-500/10 dark:text-slate-400">
                      <Clock3 className="h-3 w-3" /> waits {fmtDelay(a.delayMs ?? 0)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
      </ol>
    </div>
  );
}

export function fmtDelay(ms: number): string {
  if (ms >= 60_000 * 60) return `${Math.round(ms / 3_600_000)}h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  if (ms >= 1000) return `${Math.round(ms / 1000)}s`;
  return `${ms}ms`;
}

export function conditionLabel(kind: string, config: Record<string, unknown>): { label: string; preview: string } {
  switch (kind) {
    case "KEYWORD_MATCH": {
      const keywords = (config.keywords as string[] | undefined) ?? [];
      return {
        label: "Keyword matches",
        preview: keywords.map((k) => `“${k}”`).join(", ") || "no keywords",
      };
    }
    case "EXCLUDE_KEYWORDS":
      return {
        label: "Exclude keywords",
        preview: ((config.keywords as string[] | undefined) ?? []).map((k) => `“${k}”`).join(", ") || "—",
      };
    case "POST_MATCH":
      return config.postSelection === "specific" && config.postRef
        ? { label: "Specific post", preview: `post ${String(config.postRef).slice(0, 40)}` }
        : { label: "Any post", preview: "Matches comments on any post" };
    case "FOLLOWERS_ONLY":
      return { label: "Followers only", preview: "Requires the commenter to follow the account" };
    default:
      return { label: "Condition", preview: "" };
  }
}

export function actionLabelAndPreview(a: { kind: string; config?: Record<string, unknown>; delayMs?: number }): { label: string; preview: string } {
  const cfg = a.config ?? {};
  switch (a.kind) {
    case "SEND_DM":
      return { label: "Send DM", preview: String(cfg.text ?? "") };
    case "SEND_LINK":
      return { label: "Send tracked link", preview: String(cfg.text ?? "Here you go: {{link}}") };
    case "PUBLIC_REPLY":
      return { label: "Public comment reply", preview: String(cfg.text ?? "") };
    case "ADD_TAG":
      return { label: "Tag contact", preview: `#${String(cfg.tag ?? "")}` };
    case "CALL_WEBHOOK":
      return { label: "Call webhook", preview: String(cfg.url ?? "") };
    case "DELAY":
      return { label: "Wait", preview: fmtDelay(Number(cfg.ms ?? 0)) };
    case "FOLLOW_GATE":
      return { label: "Follow gate", preview: String(cfg.gateText ?? "") };
    default:
      return { label: a.kind, preview: "" };
  }
}