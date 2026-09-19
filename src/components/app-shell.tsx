"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Workflow, Inbox as InboxIcon, Users, BarChart3, Link2, Activity, Settings, LogOut, Zap, Github, Menu, X, Sun, Moon,
} from "lucide-react";
import { api, setActiveWorkspace, getActiveWorkspace, setCsrfToken, markDemoMode } from "@/lib/client";
import { ToastProvider } from "@/components/ui/ui";
import { product } from "@/config";

interface SessionData {
  user: { id: string; email: string; name?: string | null; isDemo: boolean };
  workspaces: { id: string; name: string; role: string }[];
  activeWorkspaceId: string | null;
  csrfToken: string | null;
  demoMode?: boolean;
}

const NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/automations", label: "Automations", icon: Workflow },
  { href: "/app/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/app/contacts", label: "Contacts", icon: Users },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/app/links", label: "Tracked links", icon: Link2 },
  { href: "/app/executions", label: "Executions", icon: Activity },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionData | null>(null);
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const storedDark = localStorage.getItem("lf-theme") === "dark";
    setDark(storedDark);
    document.documentElement.classList.toggle("dark", storedDark);

    api<SessionData>("/api/auth/me", { skipAuthRedirect: true })
      .then((data) => {
        setCsrfToken(data.csrfToken);
        markDemoMode(Boolean(data.demoMode));
        if (data.activeWorkspaceId) setActiveWorkspace(data.activeWorkspaceId);
        setSession(data);
      })
      .catch(() => {
        router.replace("/login");
      })
      .finally(() => setReady(true));
  }, [router]);

  useEffect(() => {
    document.getElementById("ws-badge")?.remove();
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("lf-theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  };

  const switchWorkspace = async (id: string) => {
    setActiveWorkspace(id);
    router.refresh();
  };

  const signOut = async () => {
    await api("/api/auth/signout", { method: "POST", body: {} }).catch(() => undefined);
    router.replace("/login");
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const activeWsName = session?.workspaces.find((w) => w.id === getActiveWorkspace())?.name ?? session?.workspaces[0]?.name ?? "Workspace";

  const sidebar = (
    <div className="flex h-full w-64 flex-col border-r border-line-light bg-surface-light dark:border-line-dark dark:bg-surface-dark">
      <div className="flex items-center gap-2 px-5 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-xs font-black text-white">LF</div>
        <div>
          <p className="text-sm font-bold leading-none">{product.name}</p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-light dark:text-muted-dark">{product.company}</p>
        </div>
      </div>

      {/* Workspace switcher */}
      <div className="px-3 pb-2">
        <select
          className="input !py-1.5 text-xs font-semibold"
          value={getActiveWorkspace() ?? ""}
          onChange={(e) => e.target.value && switchWorkspace(e.target.value)}
          aria-label="Switch workspace"
        >
          {session?.workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} · {w.role.toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Main">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-accent/10 text-accent" : "text-muted-light hover:bg-black/5 hover:text-ink-light dark:text-muted-dark dark:hover:bg-white/5 dark:hover:text-ink-dark"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        <Link
          href="/app/settings"
          onClick={() => setSidebarOpen(false)}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            pathname.startsWith("/app/settings")
              ? "bg-accent/10 text-accent"
              : "text-muted-light hover:bg-black/5 hover:text-ink-light dark:text-muted-dark dark:hover:bg-white/5 dark:hover:text-ink-dark"
          }`}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </nav>

      <div className="border-t border-line-light p-3 dark:border-line-dark">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-medium text-muted-light dark:text-muted-dark">{session?.user.email}</p>
          <div className="flex items-center gap-1">
            <button onClick={toggleTheme} className="btn-ghost !p-1.5" aria-label="Toggle theme">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button onClick={signOut} className="btn-ghost !p-1.5" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        <a href={product.links.github} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-1 text-xs text-muted-light dark:text-muted-dark hover:text-ink-light dark:hover:text-ink-dark">
          <Github className="h-3.5 w-3.5" /> Open source · v0.1.0
        </a>
        {session?.user.isDemo && (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            Demo session — seeded data
          </p>
        )}
      </div>
    </div>
  );

  return (
    <ToastProvider>
      <div className="min-h-screen">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-line-light bg-surface-light px-4 py-3 md:hidden dark:border-line-dark dark:bg-surface-dark">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[10px] font-black text-white">LF</div>
            <span className="text-sm font-bold">{product.name}</span>
          </div>
          <button onClick={() => setSidebarOpen(true)} className="btn-ghost !p-1.5" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
        </div>

        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
            <div className="absolute inset-y-0 left-0">
              {sidebar}
              <button onClick={() => setSidebarOpen(false)} className="absolute right-3 top-3 text-muted-light dark:text-muted-dark" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        <div className="flex">
          <aside className="sticky top-0 hidden h-screen md:block">{sidebar}</aside>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8" id="main-content">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}