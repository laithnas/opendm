import Link from "next/link";
import { Workflow, Inbox as InboxIcon, Users, BarChart3, Github, Server, MessagesSquare, Link2, Zap } from "lucide-react";
import { product } from "@/config";

// Public landing page — communicates one idea: own your social automations.

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-xs font-black text-white">LF</div>
          <span className="text-[15px] font-bold">{product.name}</span>
        </div>
        <div className="flex items-center gap-4">
          <a href={product.links.github} className="hidden items-center gap-1.5 text-sm font-medium text-muted-light hover:text-ink-light sm:flex dark:text-muted-dark dark:hover:text-ink-dark">
            <Github className="h-4 w-4" /> GitHub
          </a>
          <Link href="/app" className="btn-primary">
            Open app
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 text-center">
        <p className="mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full border border-line-light bg-surface-light px-3 py-1 text-xs font-semibold text-muted-light dark:border-line-dark dark:bg-surface-dark dark:text-muted-dark">
          <Zap className="h-3 w-3 text-accent" /> Open-source social automation OS
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight md:text-6xl">
          Comment. DM.
          <br />
          Capture. <span className="text-accent">Automate.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-light dark:text-muted-dark">
          {product.tagline} Turn Instagram comments, DMs and story replies into workflows you control — with an inbox, contacts, tracked links and analytics that stay yours.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href={product.links.github} target="_blank" rel="noreferrer" className="btn-primary">
            <Github className="h-4 w-4" /> View on GitHub
          </a>
          <Link href="/app" className="btn-secondary">
            Deploy your own →
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-light dark:text-muted-dark">Self-hosted · PostgreSQL + Redis · No scraping, official Meta APIs only</p>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Workflow, title: "Visual automation builder", body: "Trigger → conditions → actions. Read your automations at a glance, test them before they go live, export and import them as portable JSON." },
            { icon: MessagesSquare, title: "Unified inbox", body: "Every DM and story reply in one place — with contact context, tags and the messaging-window rules shown honestly." },
            { icon: Users, title: "Mini CRM", body: "Contacts, tags, engagement timelines and automation history. Privacy-conscious: only what the platform API legally exposes." },
            { icon: Link2, title: "Tracked links", body: "Short, non-guessable redirects with clicks, unique clicks and CTR per campaign." },
            { icon: BarChart3, title: "Real analytics", body: "Triggers, DMs sent, failures, clicks and conversion funnels — computed from real execution data, not fake counters." },
            { icon: Server, title: "Self-host everything", body: "One command local dev, docker compose for Postgres + Redis, a standalone worker process. Your data never leaves your server." },
          ].map((f) => (
            <div key={f.title} className="card card-pad">
              <f.icon className="mb-3 h-5 w-5 text-accent" />
              <h3 className="text-sm font-bold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-light dark:text-muted-dark">{f.body}</p>
            </div>
          ))}
        </div>

        {/* Architecture strip */}
        <div className="card mt-8 flex flex-wrap items-center justify-center gap-3 px-6 py-5 text-sm text-muted-light dark:text-muted-dark">
          <span className="font-semibold text-ink-light dark:text-ink-dark">Every social event flows:</span>
          <span className="rounded-md bg-canvas-light px-2.5 py-1 font-mono text-xs dark:bg-canvas-dark">Webhook → Queue → Conditions → Actions → CRM</span>
          <span className="hidden sm:inline">— with idempotent executions, per-account rate limits and retries.</span>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line-light py-8 dark:border-line-dark">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 text-sm text-muted-light dark:text-muted-dark">
          <p>
            {product.name} · {product.company}
          </p>
          <div className="flex gap-4">
            <a href={product.links.github} target="_blank" rel="noreferrer" className="hover:text-ink-light dark:hover:text-ink-dark">
              GitHub
            </a>
            <Link href="/app" className="hover:text-ink-light dark:hover:text-ink-dark">
              App
            </Link>
            <a href="https://www.leonyx-ai.com/" target="_blank" rel="noreferrer" className="hover:text-ink-light dark:hover:text-ink-dark">
              leonyx-ai.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}