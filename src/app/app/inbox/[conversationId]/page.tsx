"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Send, Lock, ExternalLink, Tag as TagIcon, Plus } from "lucide-react";
import { api, getActiveWorkspace, fmtRelative, ApiError } from "@/lib/client";
import { PageHeader, StatusBadge, Spinner, useToast } from "@/components/ui/ui";

interface MessageRow {
  id: string;
  direction: string;
  kind: string;
  content: string;
  status: string;
  createdAt: string;
}

interface ConversationDetail {
  id: string;
  status: string;
  type: string;
  unread: boolean;
  contact: {
    id: string;
    username: string;
    name: string | null;
    notes: string | null;
    tags: { tag: { id: string; name: string; color: string } }[];
    _count: { messages: number; linkClicks: number };
  };
  messages: MessageRow[];
  window: { allowed: boolean; reason: string };
}

export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const ws = getActiveWorkspace();
  const [conv, setConv] = useState<ConversationDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [newTag, setNewTag] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () => {
    if (!ws) return;
    api<{ conversation: ConversationDetail; window: { allowed: boolean; reason: string } }>(`/api/workspaces/${ws}/inbox/${params.conversationId}`)
      .then((r) => {
        setConv({ ...r.conversation, window: r.window });
        setNotes(r.conversation.contact.notes ?? "");
      })
      .catch(() => router.push("/app/inbox"));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [ws, params.conversationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.messages.length]);

  const send = async () => {
    if (!draft.trim() || !ws) return;
    setSending(true);
    try {
      const res = await api<{ ok: boolean }>(`/api/workspaces/${ws}/inbox/${params.conversationId}`, { method: "POST", body: { content: draft } });
      if (res.ok) {
        setDraft("");
        load();
      }
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "Send failed — check the messaging window");
    } finally {
      setSending(false);
    }
  };

  const saveNotes = async () => {
    if (!conv) return;
    setSavingNotes(true);
    try {
      await api(`/api/workspaces/${ws}/contacts/${conv.contact.id}`, { method: "PATCH", body: { notes } });
      toast("success", "Note saved");
    } catch {
      toast("error", "Failed to save note");
    } finally {
      setSavingNotes(false);
    }
  };

  const addTag = async () => {
    if (!conv || !newTag.trim()) return;
    try {
      await api(`/api/workspaces/${ws}/contacts/${conv.contact.id}`, { method: "POST", body: { action: "addTag", tag: newTag.trim() } });
      setNewTag("");
      load();
    } catch {
      toast("error", "Failed to add tag");
    }
  };

  if (!conv) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const windowNote =
    conv.messages.length > 0 && conv.messages[conv.messages.length - 1]?.direction === "INBOUND" && conv.window && !conv.window.allowed
      ? conv.window.reason
      : null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <button className="btn-ghost !p-1.5" onClick={() => router.push("/app/inbox")} aria-label="Back to inbox">
              <ArrowLeft className="h-4 w-4" />
            </button>
            {conv.contact.name ?? `@${conv.contact.username}`}
            <span className="text-sm font-normal text-muted-light dark:text-muted-dark">@{conv.contact.username}</span>
            <StatusBadge status={conv.status} />
          </span>
        }
        actions={
          <button
            className="btn-secondary"
            onClick={() => router.push(`/app/contacts/${conv.contact.id}`)}
          >
            <ExternalLink className="h-4 w-4" /> Contact profile
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Thread */}
        <div className="card flex h-[60vh] flex-col lg:col-span-2">
          {windowNote && (
            <div className="flex items-start gap-2 border-b border-canvas-light bg-amber-50/70 px-4 py-3 text-xs text-amber-800 dark:border-canvas-dark dark:bg-amber-500/10 dark:text-amber-400">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{windowNote}</span>
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {conv.messages.length === 0 && (
              <p className="py-16 text-center text-sm text-muted-light dark:text-muted-dark">No messages in this conversation yet.</p>
            )}
            {conv.messages.map((m) => (
              <div key={m.id} className={`flex ${m.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.direction === "OUTBOUND"
                    ? "rounded-br-sm bg-accent text-white"
                    : "rounded-bl-sm bg-canvas-light text-ink-light dark:bg-canvas-dark dark:text-ink-dark"
                }`}>
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <p className={`mt-1 text-[10px] ${m.direction === "OUTBOUND" ? "text-white/70" : "text-muted-light dark:text-muted-dark"}`}>
                    {fmtRelative(m.createdAt)}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-line-light p-3 dark:border-line-dark">
            {conv.window && !conv.window.allowed ? (
              <div className="flex items-start gap-2 rounded-lg bg-canvas-light px-3 py-2.5 text-xs text-muted-light dark:bg-canvas-dark dark:text-muted-dark">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Replies are blocked by Instagram&apos;s messaging window: <b>{conv.window.reason}</b>
                </span>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <textarea
                  className="input min-h-10 resize-none"
                  placeholder="Reply… (respects the messaging window)"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={2}
                />
                <button className="btn-primary !px-3" onClick={send} disabled={sending || !draft.trim()} aria-label="Send reply">
                  {sending ? <Spinner /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Contact side panel */}
        <div className="space-y-4">
          <div className="card card-pad">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">Contact</h3>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                {(conv.contact.name ?? conv.contact.username).slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-bold">{conv.contact.name ?? conv.contact.username}</p>
                <p className="text-xs text-muted-light dark:text-muted-dark">@{conv.contact.username}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between"><dt className="text-muted-light dark:text-muted-dark">Messages</dt><dd className="tabular-nums">{conv.contact._count.messages}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-light dark:text-muted-dark">Link clicks</dt><dd className="tabular-nums">{conv.contact._count.linkClicks}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-light dark:text-muted-dark">Type</dt><dd>{conv.type === "STORY_REPLY" ? "Story reply" : "DM"}</dd></div>
            </dl>
          </div>

          <div className="card card-pad">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">Tags</h3>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {conv.contact.tags.map(({ tag }) => (
                <span key={tag.id} className="badge" style={{ backgroundColor: `${tag.color}18`, color: tag.color }}>
                  <TagIcon className="h-3 w-3" /> {tag.name}
                </span>
              ))}
              {conv.contact.tags.length === 0 && <span className="text-xs text-muted-light dark:text-muted-dark">No tags</span>}
            </div>
            <div className="flex gap-1.5">
              <input className="input !py-1.5 text-xs" placeholder="Add tag…" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} />
              <button className="btn-secondary !px-2.5" onClick={addTag} aria-label="Add tag"><Plus className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          <div className="card card-pad">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-light dark:text-muted-dark">Notes</h3>
            <textarea className="input min-h-20 text-xs" placeholder="Internal notes about this contact…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <button className="btn-secondary mt-2 w-full !py-1.5 text-xs" onClick={saveNotes} disabled={savingNotes}>
              {savingNotes ? <Spinner className="h-3 w-3" /> : null} Save note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}