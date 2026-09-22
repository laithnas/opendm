"use client";

// Small UI primitives. Kept intentionally dependency-free.

import { useCallback, useEffect, useState, createContext, useContext } from "react";
import { X, Loader2, CheckCircle2, AlertTriangle, Info } from "lucide-react";

// ── Status badges ─────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  COMPLETED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  DELIVERED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  DRAFT: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400",
  PAUSED: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  PENDING: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  QUEUED: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  RUNNING: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  FAILED: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  PARTIALLY_COMPLETED: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  SKIPPED: "bg-slate-100 text-slate-500 dark:bg-slate-500/10 dark:text-slate-400",
  ARCHIVED: "bg-slate-100 text-slate-500 dark:bg-slate-500/10 dark:text-slate-400",
  EXPIRED: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  REVOKED: "bg-slate-100 text-slate-500 dark:bg-slate-500/10 dark:text-slate-400",
  ERROR: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  PENDING_MODE: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
  OPEN: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  CLOSED: "bg-slate-100 text-slate-500 dark:bg-slate-500/10 dark:text-slate-400",
  INBOUND: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300",
  OUTBOUND: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const style = STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300";
  return <span className={`badge ${style}`}>{label ?? prettify(status)}</span>;
}

export function prettify(value: string): string {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Spinner / skeletons ───────────────────────────────────────────────────

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-label="Loading" />;
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 dark:bg-slate-700/40 ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-8 py-14 text-center">
      {icon && <div className="text-muted-light dark:text-muted-dark">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted-light dark:text-muted-dark">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-accent" : "bg-slate-300 dark:bg-slate-600"
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
    </button>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative card max-h-[85vh] w-full overflow-y-auto p-6 shadow-pop animate-fade-in ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="btn-ghost !p-1.5" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  danger,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {description && <p className="mb-5 text-sm text-muted-light dark:text-muted-dark">{description}</p>}
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy}>
          {busy ? <Spinner /> : null}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

// ── Toasts ────────────────────────────────────────────────────────────────

interface ToastItem {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
}

const ToastContext = createContext<{ toast: (kind: ToastItem["kind"], message: string) => void }>({ toast: () => undefined });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((kind: ToastItem["kind"], message: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const icons = {
    success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    error: <AlertTriangle className="h-4 w-4 text-red-500" />,
    info: <Info className="h-4 w-4 text-blue-500" />,
  };
  const border = { success: "border-emerald-200 dark:border-emerald-500/30", error: "border-red-200 dark:border-red-500/30", info: "border-blue-200 dark:border-blue-500/30" };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={`card pointer-events-auto flex items-start gap-2.5 border-l-4 !p-3.5 animate-fade-in ${border[t.kind]}`}>
            {icons[t.kind]}
            <p className="text-sm">{t.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  sub,
  icon,
  onClick,
  active,
  dimmed,
  ringClass,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  /** Makes the card clickable — used for chart cross-filtering (click a KPI to isolate it). */
  onClick?: () => void;
  /** Highlights the card as the currently isolated metric. */
  active?: boolean;
  /** Fades the card when a *different* metric is isolated. */
  dimmed?: boolean;
  /** Tailwind ring/border color class applied when active, e.g. "ring-[#8b5cf6] border-[#8b5cf6]". */
  ringClass?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`card card-pad text-left transition-all ${onClick ? "cursor-pointer hover:border-ink-light/20 dark:hover:border-ink-dark/20" : ""} ${
        active ? `ring-2 ring-offset-2 ring-offset-canvas-light dark:ring-offset-canvas-dark ${ringClass ?? "ring-accent border-accent"}` : ""
      } ${dimmed ? "opacity-45" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-light dark:text-muted-dark">{label}</p>
          <p className="kpi mt-1">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-light dark:text-muted-dark">{sub}</p>}
        </div>
        {icon && <div className="text-muted-light/60 dark:text-muted-dark/60">{icon}</div>}
      </div>
    </Comp>
  );
}

// ── Page header ───────────────────────────────────────────────────────────

export function PageHeader({ title, description, actions }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-light dark:text-muted-dark">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── useApi hook (load + mutate with busy/error) ───────────────────────────

export function useApi<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    setLoading(true);
    setError(null);
    loader()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Request failed"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}