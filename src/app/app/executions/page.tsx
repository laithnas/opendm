"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { api, getActiveWorkspace, fmtRelative } from "@/lib/client";
import { PageHeader, StatusBadge, EmptyState, Skeleton } from "@/components/ui/ui";

interface ExecRow {
  id: string;
  status: string;
  triggerType: string;
  createdAt: string;
  completedAt: string | null;
  automation: { id: string; name: string };
  contact: { id: string; username: string; name: string | null } | null;
  _count: { steps: number };
}

const PAGE = 25;

export default function ExecutionsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const ws = getActiveWorkspace();
  const [items, setItems] = useState<ExecRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(params.get("status") ?? "ALL");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    if (!ws) return;
    api<{ executions: ExecRow[]; total: number }>(`/api/workspaces/${ws}/executions?page=${page}&status=${status}`)
      .then((r) => {
        setItems(r.executions);
        setTotal(r.total);
      })
      .catch(() => setItems([]));
  }, [ws, page, status]);

  return (
    <div>
      <PageHeader title="Executions" description="Every automation run with its steps — observable, traceable, retryable." />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {["ALL", "COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "SKIPPED", "RUNNING", "QUEUED"].map((s) => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); }} className={`rounded-full px-3 py-1 text-xs font-semibold ${status === s ? "bg-ink-light text-white dark:bg-ink-dark dark:text-ink-light" : "bg-white text-muted-light dark:bg-surface-dark dark:text-muted-dark"}`}>
            {s === "ALL" ? "All" : s.replace(/_/g, " ").toLowerCase()}
          </button>
        ))}
      </div>

      {!items ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : items.length === 0 ? (
        <EmptyState icon={<Activity className="h-8 w-8" />} title="No executions" description="Trigger a test webhook or wait for real events — every run shows up here." />
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base table-hover">
            <thead>
              <tr>
                <th>Automation</th>
                <th>Trigger</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Steps</th>
                <th>Started</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} onClick={() => router.push(`/app/executions/${e.id}`)}>
                  <td className="font-medium">{e.automation.name}</td>
                  <td>{e.triggerType.replace("_", " ").toLowerCase()}</td>
                  <td>{e.contact ? `@${e.contact.username}` : "—"}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td className="tabular-nums">{e._count.steps}</td>
                  <td className="text-muted-light dark:text-muted-dark">{fmtRelative(e.createdAt)}</td>
                  <td className="tabular-nums text-muted-light dark:text-muted-dark">
                    {e.completedAt ? Math.max(0, Math.round((new Date(e.completedAt).getTime() - new Date(e.createdAt).getTime()) / 1000)) + "s" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > PAGE && (
            <div className="flex items-center justify-between border-t border-line-light px-4 py-3 text-xs dark:border-line-dark">
              <button className="btn-ghost !py-1" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-3.5 w-3.5" /> Prev</button>
              <span className="text-muted-light dark:text-muted-dark">Page {page} of {Math.ceil(total / PAGE)} · {total} runs</span>
              <button className="btn-ghost !py-1" disabled={page >= Math.ceil(total / PAGE)} onClick={() => setPage(page + 1)}>Next <ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}