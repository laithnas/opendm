// Client-side API layer: workspace header + CSRF + error normalization.

// Runtime demo-mode flag. The server reports it (DEMO_MODE env) through the
// session/status APIs; build-time env inlining is unreliable for this.
let demoMode = false;
export function markDemoMode(v: boolean) {
  demoMode = v;
}
export function isDemoMode() {
  return demoMode;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// CSRF token is returned by /api/auth/me (cookie stays httpOnly).
let csrfToken: string | null = null;
let csrfPromise: Promise<string | null> | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

/** Idempotent: fetches the token once; concurrent callers share one request. */
export async function ensureCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = api<any>("/api/auth/me", { skipAuthRedirect: true })
      .then((data) => {
        csrfToken = data?.csrfToken ?? null;
        return csrfToken;
      })
      .catch(() => null)
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

let activeWorkspaceId: string | null = null;

export function setActiveWorkspace(id: string): void {
  activeWorkspaceId = id;
  try {
    document.cookie = `lf_ws=${id}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // cookie write is best-effort (SSR safety)
  }
}

export function getActiveWorkspace(): string | null {
  return activeWorkspaceId;
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
  workspace?: string | null; // defaults to active workspace
  skipAuthRedirect?: boolean;
  headers?: Record<string, string>;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  const ws = opts.workspace !== undefined ? opts.workspace : activeWorkspaceId;
  if (ws) headers["x-workspace-id"] = ws;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    const csrf = await ensureCsrfToken();
    if (csrf) headers["x-csrf-token"] = csrf;
  }

  const res = await fetch(path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body (file downloads, etc.)
  }

  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; code?: string; details?: unknown };
    if (res.status === 401 && !opts.skipAuthRedirect && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new ApiError(res.status, err.code ?? "ERROR", err.error ?? `Request failed (${res.status})`, err.details);
  }
  return data as T;
}

export const post = <T = unknown>(path: string, body?: unknown, opts?: ApiOptions) =>
  api<T>(path, { ...opts, method: "POST", body });

export const patch = <T = unknown>(path: string, body?: unknown, opts?: ApiOptions) =>
  api<T>(path, { ...opts, method: "PATCH", body });

export const del = <T = unknown>(path: string, opts?: ApiOptions) => api<T>(path, { ...opts, method: "DELETE" });

export function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function fmtPercent(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(1)}%`;
}