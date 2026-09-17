"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelTopClose, MailPlus, Search } from "lucide-react";
import { api, getActiveWorkspace, fmtRelative } from "@/lib/client";
import { PageHeader, EmptyState, Skeleton, useToast } from "@/components/ui/ui";

interface ContactRow {
  id: string;
  username: string;
  name: string | null;
  notes: string | null;
  isFollower: boolean | null;
  source: string;
  lastSeenAt: string;
  tags: { tag: { id: string; name: string; color: string } }[];
  _count: { messages: number; linkClicks: number; executions: number };
}

interface TagMeta { id: string; name: string; color: string; }

export default function ContactsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const ws = getActiveWorkspace();
  const [items, setItems] = useState<ContactRow[] | null>(null);
  const [tags, setTags] = useState<TagMeta[]>([]);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | undefined>();
  const [showAdd, setShowAdd] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    if (!ws) return;
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (tagFilter) params.set("tag", tagFilter);
    api<{ items: ContactRow[]; tags: TagMeta[] }>(`/api/workspaces/${ws}/contacts?${params.toString()}`)
      .then((r) => {
        setItems(r.items);
        setTags(r.tags);
      })
      .catch(() => setItems([]));
  }, [ws, query, tagFilter]);

  const addManual = async () => {
    if (!newUsername.trim()) return;
    try {
      await api(`/api/workspaces/${ws}/contacts`, { method: "POST", body: { username: newUsername.trim(), name: newName.trim() || undefined } });
      toast("success", "Contact added");
      setNewUsername("");
      setNewName("");
      setShowAdd(false);
      setQuery(newUsername.trim());
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="Everyone who has engaged with your automations — with tags, engagement history and interactions."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setShowAdd(true)}>
              <MailPlus className="h-4 w-4" /> Add contact
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light dark:text-muted-dark" />
          <input className="input !w-64 !pl-9" placeholder="Search contacts…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setTagFilter(undefined)} className={`rounded-full px-3 py-1 text-xs font-semibold ${!tagFilter ? "bg-ink-light text-white dark:bg-ink-dark dark:text-ink-light" : "bg-white text-muted-light dark:bg-surface-dark dark:text-muted-dark"}`}>
            All
          </button>
          {tags.map((t) => (
            <button key={t.id} onClick={() => setTagFilter(tagFilter === t.id ? undefined : t.id)} className={`rounded-full px-3 py-1 text-xs font-semibold ${tagFilter === t.id ? "" : "bg-white text-muted-light dark:bg-surface-dark dark:text-muted-dark"}`} style={tagFilter === t.id ? { backgroundColor: `${t.color}20`, color: t.color } : undefined}>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {!items ? (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<PanelTopClose className="h-8 w-8" />}
          title="No contacts yet"
          description="Contacts appear automatically when automations or conversations touch a person. Add one manually to get started."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => (
            <button key={c.id} onClick={() => router.push(`/app/contacts/${c.id}`)} className="card p-4 text-left transition-colors hover:border-accent/30">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                  {(c.name ?? c.username).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{c.name ?? c.username}</p>
                  <p className="text-xs text-muted-light dark:text-muted-dark">@{c.username}</p>
                </div>
                {c.isFollower === false && <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-500/10 dark:text-slate-400">not following</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.tags.map(({ tag }) => (
                  <span key={tag.id} className="badge text-[10px]" style={{ backgroundColor: `${tag.color}18`, color: tag.color }}>{tag.name}</span>
                ))}
                {c.tags.length === 0 && <span className="text-[11px] text-muted-light/60 dark:text-muted-dark/60">no tags</span>}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-line-light pt-2.5 text-[11px] text-muted-light dark:border-line-dark dark:text-muted-dark">
                <span>{c._count.messages} msgs · {c._count.linkClicks} clicks</span>
                <span>{fmtRelative(c.lastSeenAt)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAdd(false)} />
          <div className="card relative w-full max-w-sm p-6 shadow-pop animate-fade-in">
            <h2 className="mb-4 text-lg font-semibold">Add contact</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Instagram username</label>
                <input className="input" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="username" autoFocus />
              </div>
              <div>
                <label className="label">Display name (optional)</label>
                <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" />
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button className="btn-primary" onClick={addManual} disabled={!newUsername.trim()}>Add</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}