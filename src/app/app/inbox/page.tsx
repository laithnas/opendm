"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Inbox as InboxIcon, Lock } from "lucide-react";
import { api, getActiveWorkspace, fmtRelative } from "@/lib/client";
import { PageHeader, EmptyState, Skeleton } from "@/components/ui/ui";

interface ConversationRow {
  id: string;
  status: string;
  unread: boolean;
  type: string;
  lastMessageAt: string | null;
  contact: { id: string; username: string; name: string | null };
  messages: { content: string; direction: string; createdAt: string }[];
}

export default function InboxPage() {
  const router = useRouter();
  const ws = getActiveWorkspace();
  const [items, setItems] = useState<ConversationRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    if (!ws) return;
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status !== "ALL") params.set("status", status);
    api<{ items: ConversationRow[] }>(`/api/workspaces/${ws}/inbox?${params.toString()}`)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [ws, query, status]);

  return (
    <div>
      <PageHeader
        title="Inbox"
        description="Conversations from DMs and story replies, with the messaging window shown honestly."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-light dark:text-muted-dark" />
          <input className="input !w-64 !pl-9" placeholder="Search conversations…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex gap-1.5">
          {["ALL", "OPEN", "CLOSED"].map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1 text-xs font-semibold ${status === s ? "bg-ink-light text-white dark:bg-ink-dark dark:text-ink-light" : "bg-white text-muted-light dark:bg-surface-dark dark:text-muted-dark"}`}>
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {!items ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="h-8 w-8" />}
          title="No conversations yet"
          description="When followers DM you or reply to stories, conversations land here — including the ones your automations start from."
        />
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {items.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/app/inbox/${c.id}`)}
              className={`card flex items-start gap-3 p-4 text-left transition-colors hover:border-accent/30 ${c.unread ? "border-l-4 border-l-accent" : ""}`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                {(c.contact.name ?? c.contact.username).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={`truncate text-sm ${c.unread ? "font-bold" : "font-medium"}`}>
                    {c.contact.name ?? `@${c.contact.username}`}
                    {c.type === "STORY_REPLY" && <span className="ml-2 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">story</span>}
                  </p>
                  <span className="shrink-0 text-[11px] text-muted-light dark:text-muted-dark">{c.lastMessageAt ? fmtRelative(c.lastMessageAt) : ""}</span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-light dark:text-muted-dark">
                  {c.messages[0]?.content ?? "No messages"}
                </p>
                <p className="mt-1 text-[11px] text-muted-light/70 dark:text-muted-dark/70">@{c.contact.username}</p>
              </div>
              {c.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}