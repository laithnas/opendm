"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Instagram, RefreshCw, Trash2, Plus, UserPlus, Shield, Users, ScrollText } from "lucide-react";
import { api, getActiveWorkspace, ApiError } from "@/lib/client";
import { PageHeader, StatusBadge, Spinner, useToast, ConfirmDialog } from "@/components/ui/ui";
import { product } from "@/config";

interface Connection {
  id: string;
  provider: string;
  username: string;
  displayName: string | null;
  status: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  tokenExpiresAt: string | null;
}

interface Member { id: string; user: { id: string; email: string; name: string | null }; role: string; createdAt: string; }
interface Invite { id: string; email: string; role: string; status: string; createdAt: string; }

export default function SettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const ws = getActiveWorkspace();
  const [tab, setTab] = useState<"connections" | "members" | "audit" | "danger">("connections");
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [auditLogs, setAuditLogs] = useState<{ id: string; action: string; createdAt: string; meta: Record<string, unknown> | null }[] | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [confirm, setConfirm] = useState<{ kind: "revoke" | "remove" | "revokeInvite"; id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadConnections = () => {
    if (!ws) return;
    api<{ connections: Connection[] }>(`/api/workspaces/${ws}/settings`).then((r) => setConnections(r.connections));
  };

  const loadMembers = () => {
    if (!ws) return;
    Promise.all([
      api<{ members: Member[]; invites: Invite[] }>(`/api/workspaces/${ws}/members`),
      api<{ logs: typeof auditLogs }>(`/api/workspaces/${ws}/audit`),
    ])
      .then(([m, a]) => {
        setMembers(m.members);
        setInvites(m.invites);
        setAuditLogs(a.logs);
      })
      .catch(() => undefined);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setConnections(null);
    loadConnections();
  }, [ws, tab]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab === "members" || tab === "audit") loadMembers();
  }, [ws, tab]);

  const connectDemo = async () => {
    setBusy(true);
    try {
      await api(`/api/workspaces/${ws}/connections`, { method: "POST", body: { action: "demo" } });
      toast("success", "Demo account connected");
      loadConnections();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const startOAuth = async () => {
    setBusy(true);
    try {
      const res = await api<{ oauthUrl?: string }>(`/api/workspaces/${ws}/connections`, { method: "POST", body: {} });
      if (res.oauthUrl) window.location.href = res.oauthUrl;
      else toast("error", "META_APP_ID is not configured — use the demo account or add credentials to .env");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const healthCheck = async (id: string) => {
    try {
      const res = await api<{ ok: boolean; status: string; error?: string }>(`/api/workspaces/${ws}/connections/${id}`, { method: "POST", body: { action: "health" } });
      toast(res.ok ? "success" : "error", res.ok ? "Token is healthy" : res.error ?? "Check failed");
      loadConnections();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Check failed");
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    try {
      await api(`/api/workspaces/${ws}/connections/${id}`, { method: "DELETE" });
      toast("success", "Connection revoked");
      loadConnections();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    try {
      await api(`/api/workspaces/${ws}/members`, { method: "POST", body: { email: inviteEmail.trim(), role: inviteRole } });
      toast("success", "Invitation sent");
      setInviteEmail("");
      loadMembers();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (id: string) => {
    setBusy(true);
    try {
      await api(`/api/workspaces/${ws}/members/${id}`, { method: "DELETE" });
      toast("success", "Member removed");
      loadMembers();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const revokeInvite = async (id: string) => {
    await api(`/api/workspaces/${ws}/invites/${id}`, { method: "DELETE" });
    toast("success", "Invitation revoked");
    loadMembers();
    setConfirm(null);
  };

  const tabs: { id: typeof tab; label: string; icon: React.ElementType }[] = [
    { id: "connections", label: "Connections", icon: Instagram },
    { id: "members", label: "Team", icon: Users },
    { id: "audit", label: "Audit log", icon: ScrollText },
    { id: "danger", label: "Danger zone", icon: Shield },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" description={`${product.name} workspace settings.`} />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === t.id ? "bg-ink-light text-white dark:bg-ink-dark dark:text-ink-light" : "bg-white text-muted-light dark:bg-surface-dark dark:text-muted-dark"}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "connections" && (
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={connectDemo} disabled={busy}>
              <Plus className="h-4 w-4" /> Connect demo account
            </button>
            <button className="btn-secondary" onClick={startOAuth} disabled={busy}>
              <Instagram className="h-4 w-4" /> Connect real Instagram
            </button>
          </div>
          <p className="mb-4 text-xs text-muted-light dark:text-muted-dark">
            Real connections use Instagram&apos;s official API (Meta Login for Business). Tokens are encrypted at rest and never exposed to the browser.
          </p>

          {!connections ? (
            <SkeletonRow />
          ) : connections.length === 0 ? (
            <div className="card p-8 text-center text-sm text-muted-light dark:text-muted-dark">No social accounts connected yet.</div>
          ) : (
            <div className="space-y-3">
              {connections.map((c) => (
                <div key={c.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-pink-500 text-white">
                      <Instagram className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">{c.displayName ?? c.username}</p>
                      <p className="text-xs text-muted-light dark:text-muted-dark">@{c.username} · {c.provider.toLowerCase()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={c.status} />
                    <button className="btn-ghost !p-1.5" title="Check health" onClick={() => healthCheck(c.id)} disabled={busy}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button className="btn-ghost !p-1.5 !text-red-500" title="Revoke" onClick={() => setConfirm({ kind: "revoke", id: c.id, label: c.username })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "members" && (
        <div>
          <div className="card mb-4 p-4">
            <h3 className="mb-3 text-sm font-bold">Invite a teammate</h3>
            <div className="flex flex-wrap gap-2">
              <input className="input !w-72" type="email" placeholder="teammate@business.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              <select className="input !w-36" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
                <option value="OWNER">Owner</option>
              </select>
              <button className="btn-primary" onClick={sendInvite} disabled={busy || !inviteEmail.trim()}>
                <UserPlus className="h-4 w-4" /> Send invite
              </button>
            </div>
          </div>

          {members && (
            <div className="card overflow-hidden">
              <table className="table-base">
                <thead><tr><th>Member</th><th>Role</th><th>Joined</th><th></th></tr></thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <p className="font-medium">{m.user.name ?? m.user.email}</p>
                        <p className="text-xs text-muted-light dark:text-muted-dark">{m.user.email}</p>
                      </td>
                      <td><StatusBadge status={m.role} /></td>
                      <td className="text-muted-light dark:text-muted-dark">{new Date(m.createdAt).toLocaleDateString()}</td>
                      <td className="text-right">
                        {m.role !== "OWNER" && (
                          <button className="btn-ghost !p-1.5 !text-red-500" onClick={() => setConfirm({ kind: "remove", id: m.id, label: m.user.email })} aria-label="Remove member">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {invites && invites.length > 0 && (
            <div className="card mt-4 overflow-hidden">
              <div className="p-4 pb-2"><h3 className="text-sm font-bold">Pending invites</h3></div>
              <table className="table-base">
                <thead><tr><th>Email</th><th>Role</th><th>Sent</th><th></th></tr></thead>
                <tbody>
                  {invites.map((i) => (
                    <tr key={i.id}>
                      <td className="font-medium">{i.email}</td>
                      <td><StatusBadge status={i.role} /></td>
                      <td className="text-muted-light dark:text-muted-dark">{new Date(i.createdAt).toLocaleDateString()}</td>
                      <td className="text-right"><button className="btn-ghost !p-1.5 !text-red-500" onClick={() => setConfirm({ kind: "revokeInvite", id: i.id, label: i.email })}><Trash2 className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "audit" && (
        <div className="card overflow-hidden">
          {!auditLogs ? (
            <SkeletonRow />
          ) : auditLogs.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-light dark:text-muted-dark">No audit events yet.</p>
          ) : (
            <table className="table-base">
              <thead><tr><th>Action</th><th>Details</th><th>When</th></tr></thead>
              <tbody>
                {auditLogs.map((a) => (
                  <tr key={a.id}>
                    <td className="font-mono text-xs">{a.action}</td>
                    <td className="max-w-72 truncate text-xs text-muted-light dark:text-muted-dark">{a.meta ? JSON.stringify(a.meta) : "—"}</td>
                    <td className="text-xs text-muted-light dark:text-muted-dark">{new Date(a.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "danger" && (
        <div className="card border-red-200 p-5 dark:border-red-500/30">
          <h3 className="mb-2 text-sm font-bold text-red-600 dark:text-red-400">Danger zone</h3>
          <p className="mb-4 text-xs text-muted-light dark:text-muted-dark">Workspace deletion is intentionally not available through the UI in this build. Revoke connections and remove members as needed.</p>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "revoke") revoke(confirm.id);
          if (confirm.kind === "remove") removeMember(confirm.id);
          if (confirm.kind === "revokeInvite") revokeInvite(confirm.id);
        }}
        title={confirm?.kind === "revoke" ? "Revoke connection?" : confirm?.kind === "remove" ? "Remove member?" : "Revoke invitation?"}
        description={
          confirm?.kind === "revoke"
            ? `"${confirm?.label}" will stop sending. Automations keep running but sends fail until reconnected.`
            : `"${confirm?.label}" loses access to this workspace immediately.`
        }
        confirmLabel={confirm?.kind === "revoke" ? "Revoke" : confirm?.kind === "remove" ? "Remove" : "Revoke"}
        danger
        busy={busy}
      />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="space-y-3">
      <div className="h-16 animate-pulse rounded-xl bg-slate-200/60 dark:bg-slate-700/30" />
      <div className="h-16 animate-pulse rounded-xl bg-slate-200/60 dark:bg-slate-700/30" />
    </div>
  );
}