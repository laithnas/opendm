"use client";

import { useEffect, useState } from "react";
import { Link2, Plus, Copy, ExternalLink } from "lucide-react";
import { api, getActiveWorkspace, fmtNumber, fmtDate } from "@/lib/client";
import { PageHeader, EmptyState, Skeleton, useToast } from "@/components/ui/ui";

interface LinkRow {
  id: string;
  name: string;
  destination: string;
  slug: string;
  url: string;
  clickCount: number;
  uniqueClickCount: number;
  createdAt: string;
  automation: { id: string; name: string } | null;
}

export default function LinksPage() {
  const { toast } = useToast();
  const ws = getActiveWorkspace();
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [creating, setCreating] = useState(false);

  const load = () => {
    if (!ws) return;
    api<{ links: LinkRow[] }>(`/api/workspaces/${ws}/links`)
      .then((r) => setLinks(r.links))
      .catch(() => setLinks([]));
  };

  useEffect(load, [ws]);

  const create = async () => {
    setCreating(true);
    try {
      await api(`/api/workspaces/${ws}/links`, { method: "POST", body: { name, destination } });
      toast("success", "Tracked link created");
      setShowCreate(false);
      setName("");
      setDestination("");
      load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed — check the destination URL");
    } finally {
      setCreating(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast("success", "Link copied");
    } catch {
      toast("error", "Copy failed");
    }
  };

  return (
    <div>
      <PageHeader
        title="Tracked links"
        description="Short redirects with click + unique-click counts. Destinations are validated against open-redirect misuse."
        actions={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> New link
          </button>
        }
      />

      {!links ? (
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : links.length === 0 ? (
        <EmptyState
          icon={<Link2 className="h-8 w-8" />}
          title="No tracked links yet"
          description="Create a link, drop {{link}} into a DM template, and watch clicks roll in with per-contact unique counting."
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base table-hover">
            <thead>
              <tr>
                <th>Link</th>
                <th>Destination</th>
                <th>Automation</th>
                <th className="text-right">Clicks</th>
                <th className="text-right">Unique</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id} onClick={() => copy(l.url)} title="Click row to copy URL">
                  <td>
                    <p className="font-medium">{l.name}</p>
                    <p className="font-mono text-[11px] text-accent">{l.url.replace(/^https?:\/\//, "")}</p>
                  </td>
                  <td className="max-w-44 truncate text-muted-light dark:text-muted-dark">{l.destination}</td>
                  <td>{l.automation?.name ?? <span className="text-muted-light/60 dark:text-muted-dark/60">standalone</span>}</td>
                  <td className="text-right font-semibold tabular-nums">{fmtNumber(l.clickCount)}</td>
                  <td className="text-right tabular-nums text-muted-light dark:text-muted-dark">{fmtNumber(l.uniqueClickCount)}</td>
                  <td className="text-muted-light dark:text-muted-dark">{fmtDate(l.createdAt)}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button className="btn-ghost !p-1.5" onClick={(e) => { e.stopPropagation(); copy(l.url); }} aria-label="Copy URL"><Copy className="h-3.5 w-3.5" /></button>
                      <a className="btn-ghost !p-1.5" href={l.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Open"><ExternalLink className="h-3.5 w-3.5" /></a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreate(false)} />
          <div className="card relative w-full max-w-md p-6 shadow-pop animate-fade-in">
            <h2 className="mb-4 text-lg font-semibold">New tracked link</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="SEO checklist" autoFocus />
              </div>
              <div>
                <label className="label">Destination URL</label>
                <input className="input" type="url" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="https://your-site.com/resource" />
              </div>
              <p className="text-[11px] text-muted-light dark:text-muted-dark">The short link is auto-generated and non-guessable. Use {"{{link}}"} in templates.</p>
              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="btn-primary" onClick={create} disabled={creating || !name.trim() || !destination.trim()}>
                  {creating ? "Creating…" : "Create link"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}