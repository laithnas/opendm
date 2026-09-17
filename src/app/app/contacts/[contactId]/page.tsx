"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Tag as TagIcon, Plus, History, MessageSquare, MousePointerClick, Link2 } from "lucide-react";
import { api, getActiveWorkspace, fmtRelative } from "@/lib/client";
import { PageHeader, Spinner, StatusBadge, useToast } from "@/components/ui/ui";

interface TimelineItem {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  automation?: { id: string; name: string } | null;
}

interface ContactDetail {
  id: string;
  username: string;
  name: string | null;
  notes: string | null;
  isFollower: boolean | null;
  source: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

const KIND_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  COMMENT: { icon: MousePointerClick, label: "Comment", color: "text-accent" },
  DM_INBOUND: { icon: MessageSquare, label: "Inbound DM", color: "text-blue-500" },
  DM_OUTBOUND: { icon: MessageSquare, label: "Outbound DM", color: "text-emerald-500" },
  STORY_REPLY: { icon: MessageSquare, label: "Story reply", color: "text-violet-500" },
  LINK_CLICK: { icon: Link2, label: "Clicked link", color: "text-emerald-500" },
  TAG_ADDED: { icon: TagIcon, label: "Tag added", color: "text-amber-500" },
  NOTE_ADDED: { icon: History, label: "Note", color: "text-slate-500" },
  SYSTEM: { icon: History, label: "System", color: "text-slate-500" },
};

export default function ContactPage() {
  const params = useParams<{ contactId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const ws = getActiveWorkspace();
  const [data, setData] = useState<{ contact: ContactDetail; timeline: TimelineItem[]; tags: { id: string; name: string; color: string }[]; clicks: { id: string; link: { name: string; destination: string }; createdAt: string }[]; conversations: { id: string; type: string; lastMessageAt: string | null }[] } | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [newTag, setNewTag] = useState("");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ws) return;
    api(`/api/workspaces/${ws}/contacts/${params.contactId}`)
      .then((r: any) => {
        setData(r);
        setNotes(r.contact.notes ?? "");
      })
      .catch(() => router.push("/app/contacts"));
  }, [ws, params.contactId]);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const { contact, timeline, tags, clicks, conversations } = data;

  const saveNotes = async () => {
    setSaving(true);
    try {
      await api(`/api/workspaces/${ws}/contacts/${contact.id}`, { method: "PATCH", body: { notes } });
      toast("success", "Note saved");
    } catch {
      toast("error", "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const addTag = async () => {
    if (!newTag.trim()) return;
    try {
      await api(`/api/workspaces/${ws}/contacts/${contact.id}`, { method: "POST", body: { action: "addTag", tag: newTag.trim() } });
      setNewTag("");
      const fresh = await api<any>(`/api/workspaces/${ws}/contacts/${contact.id}`);
      setData(fresh);
    } catch {
      toast("error", "Failed to add tag");
    }
  };

  const removeTag = async (tagId: string) => {
    try {
      await api(`/api/workspaces/${ws}/contacts/${contact.id}`, { method: "POST", body: { action: "removeTag", tagId } });
      const fresh = await api<any>(`/api/workspaces/${ws}/contacts/${contact.id}`);
      setData(fresh);
    } catch {
      toast("error", "Failed to remove tag");
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <button className="btn-ghost !p-1.5" onClick={() => router.push("/app/contacts")} aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </button>
            {contact.name ?? `@${contact.username}`}
            <span className="text-sm font-normal text-muted-light dark:text-muted-dark">@{contact.username}</span>
            {contact.isFollower === false && <StatusBadge status="REVOKED" label="not following" />}
            {contact.isFollower === true && <StatusBadge status="ACTIVE" label="following" />}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <div className="card card-pad">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">Profile</h3>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between"><dt className="text-muted-light dark:text-muted-dark">Source</dt><dd>{contact.source.toLowerCase()}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-light dark:text-muted-dark">First seen</dt><dd>{fmtRelative(contact.firstSeenAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-light dark:text-muted-dark">Last seen</dt><dd>{fmtRelative(contact.lastSeenAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-light dark:text-muted-dark">Conversations</dt><dd>{conversations.length}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-light dark:text-muted-dark">Link clicks</dt><dd>{clicks.length}</dd></div>
            </dl>
          </div>

          <div className="card card-pad">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">Tags</h3>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <button key={t.id} onClick={() => removeTag(t.id)} className="badge transition-opacity hover:opacity-70" style={{ backgroundColor: `${t.color}18`, color: t.color }} title="Click to remove">
                  <TagIcon className="h-3 w-3" /> {t.name} ✕
                </button>
              ))}
              {tags.length === 0 && <span className="text-xs text-muted-light dark:text-muted-dark">No tags</span>}
            </div>
            <div className="flex gap-1.5">
              <input className="input !py-1.5 text-xs" placeholder="Add tag…" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} />
              <button className="btn-secondary !px-2.5" onClick={addTag} aria-label="Add tag"><Plus className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          <div className="card card-pad">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">Notes</h3>
            <textarea className="input min-h-24 text-xs" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes…" />
            <button className="btn-secondary mt-2 w-full !py-1.5 text-xs" onClick={saveNotes} disabled={saving}>{saving ? "Saving…" : "Save note"}</button>
          </div>

          {clicks.length > 0 && (
            <div className="card card-pad">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">Clicked links</h3>
              <div className="space-y-2">
                {clicks.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                    <a href={c.link.destination} target="_blank" rel="noreferrer" className="truncate font-medium text-accent hover:underline">{c.link.name}</a>
                    <span className="shrink-0 text-muted-light dark:text-muted-dark">{fmtRelative(c.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="card card-pad">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">Engagement timeline</h3>
            <ol className="relative space-y-4 border-l border-line-light pl-5 dark:border-line-dark">
              {timeline.length === 0 && <p className="pl-1 text-sm text-muted-light dark:text-muted-dark">No activity recorded.</p>}
              {timeline.map((t) => {
                const meta = KIND_META[t.kind] ?? { icon: History, label: t.kind, color: "text-slate-500" };
                const Icon = meta.icon;
                return (
                  <li key={t.id} className="relative">
                    <span className={`absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full bg-canvas-light dark:bg-canvas-dark`}>
                      <Icon className={`h-3 w-3 ${meta.color}`} />
                    </span>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {meta.label}
                        {t.automation && <span className="ml-2 text-xs font-normal text-muted-light dark:text-muted-dark">via “{t.automation.name}”</span>}
                      </p>
                      <span className="text-[11px] text-muted-light dark:text-muted-dark">{fmtRelative(t.occurredAt)}</span>
                    </div>
                    {t.payload && typeof t.payload.text === "string" && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-light dark:text-muted-dark">“{t.payload.text}”</p>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}