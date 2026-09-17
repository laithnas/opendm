#!/usr/bin/env tsx
/**
 * Leonyx Flow — one-command setup.
 *
 *   npm run init            # everything: .env, Postgres+Redis, migrate
 *   npm run init -- --seed  # + demo workspace with realistic data
 *   npm run init -- --no-docker   # you already run PG/Redis somewhere
 *
 * What it does:
 *   1. Creates .env from .env.example with RANDOM secrets (never reuse ours)
 *   2. Starts PostgreSQL + Redis via docker compose and waits for health
 *   3. Applies database migrations (prisma migrate deploy)
 *   4. Optionally seeds the demo workspace
 *   5. Prints next steps (login URL, worker command, Meta/AI env hooks)
 *
 * Zero runtime dependencies: node:fs/crypto/child_process + the project's
 * own dependencies (prisma, tsx) that `npm install` already fetched.
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import * as path from "node:path";

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};
const say = (msg: string) => console.log(`${C.green}✔${C.reset} ${msg}`);
const note = (msg: string) => console.log(`${C.cyan}ℹ${C.reset} ${msg}`);
const warn = (msg: string) => console.log(`${C.yellow}▲${C.reset} ${msg}`);
const fail = (msg: string) => {
  console.error(`${C.red}✖${C.reset} ${msg}`);
  process.exit(1);
};

const ROOT = path.resolve(__dirname, "..");
const ENV_SRC = path.join(ROOT, ".env.example");
const ENV_DST = path.join(ROOT, ".env");

function run(cmd: string, opts: { env?: NodeJS.ProcessEnv; quiet?: boolean; inherit?: boolean } = {}): boolean {
  const res = spawnSync(cmd, {
    shell: true,
    cwd: ROOT,
    stdio: opts.inherit ? "inherit" : opts.quiet ? "ignore" : "pipe",
    env: { ...process.env, ...opts.env },
  });
  return res.status === 0;
}

function randomSecret(): string {
  return randomBytes(32).toString("base64");
}

function randomVerifyToken(): string {
  return randomBytes(12).toString("hex");
}

function ensureEnvFile(): void {
  if (existsSync(ENV_DST)) {
    note(".env already exists — leaving it untouched.");
    return;
  }
  if (!existsSync(ENV_SRC)) fail(".env.example is missing — did you clone this repo correctly?");
  say("Creating .env from .env.example with random secrets");
  const template = readFileSync(ENV_SRC, "utf8");
  writeFileSync(ENV_DST, template);
  // Replace placeholder secrets with generated ones.
  const patch = (key: string, value: string) => {
    const re = new RegExp(`^${key}=.*$`, "m");
    const current = readFileSync(ENV_DST, "utf8");
    if (re.test(current)) {
      writeFileSync(ENV_DST, current.replace(re, `${key}=${value}`));
    } else {
      appendFileSync(ENV_DST, `\n${key}=${value}\n`);
    }
  };
  patch("SESSION_SECRET", randomSecret());
  patch("ENCRYPTION_KEY", randomSecret());
  patch("META_VERIFY_TOKEN", randomVerifyToken());
  say("SESSION_SECRET / ENCRYPTION_KEY / META_VERIFY_TOKEN generated");
}

function envValue(key: string): string {
  const line = readFileSync(ENV_DST, "utf8").split("\n").find((l) => l.startsWith(`${key}=`));
  return line ? line.split("=").slice(1).join("=").trim() : "";
}

function ensureDocker(): void {
  if (!run("docker compose version", { quiet: true })) {
    fail(
      "Docker is required for the local Postgres + Redis. Install Docker Desktop\n" +
        "  (https://www.docker.com/products/docker-desktop/) and start it, then re-run `npm run init`.\n" +
        "  (Already have Postgres/Redis running? Use `npm run init -- --no-docker`.)",
    );
  }
  say("Docker available");
}

function startServices(): void {
  note("Starting PostgreSQL + Redis (docker compose up -d)…");
  if (!run("docker compose up -d")) {
    fail("docker compose up failed — start Docker Desktop and retry `npm run init`.");
  }
  say("Services started");
}

function waitForServices(timeoutMs = 90_000): void {
  const start = Date.now();
  note("Waiting for Postgres + Redis health…");
  for (;;) {
    const pg = spawnSync("docker", ["exec", "leonyx-flow-postgres-1", "pg_isready", "-U", "leonyx", "-d", "leonyx_flow"], { stdio: "ignore" });
    const redis = spawnSync("docker", ["exec", "leonyx-flow-redis-1", "redis-cli", "ping"], { stdio: "ignore" });
    if (pg.status === 0 && redis.status === 0 && redis.stdout?.toString().trim() === "PONG") {
      say("PostgreSQL + Redis healthy");
      return;
    }
    if (Date.now() - start > timeoutMs) {
      warn("Timed out waiting for Postgres/Redis — continue anyway, the next step will retry.");
      return;
    }
    spawnSync("sleep", ["1"], { stdio: "ignore" });
  }
}

function migrate(): void {
  const dbUrl = envValue("DATABASE_URL") || "postgresql://leonyx:leonyx@localhost:5432/leonyx_flow?schema=public";
  note("Applying migrations (prisma migrate deploy)…");
  if (!run("npx prisma migrate deploy", { env: { DATABASE_URL: dbUrl } })) {
    fail(
      "Migration failed. Is Postgres reachable at the DATABASE_URL in .env?\n" +
        "  - Docker: ensure Docker Desktop is running, then re-run `npm run init`.\n" +
        "  - External DB: set DATABASE_URL in .env, then run `npm run db:migrate`.",
    );
  }
  say("Database schema up to date");
}

function seedDemo(): void {
  note("Seeding demo workspace (automations, contacts, executions, inbox)…");
  run("npm run db:seed", { quiet: true });
  say("Demo workspace seeded");
}

function printNextSteps(seed: boolean): void {
  const appUrl = envValue("APP_URL") || "http://localhost:3000";
  console.log("");
  console.log(C.bold + "─".repeat(60) + C.reset);
  console.log(C.green + C.bold + "  Leonyx Flow is ready 🎉" + C.reset);
  console.log(C.bold + "─".repeat(60) + C.reset);
  console.log("");
  console.log(`  ${C.bold}1. Start the app + worker:${C.reset}`);
  console.log(`     ${C.cyan}npm run dev:all${C.reset}   # app + worker together`);
  console.log(`     (or separate: ${C.cyan}npm run dev${C.reset} and ${C.cyan}npm run worker${C.reset})`);
  console.log("");
  console.log(`  ${C.bold}2. Open ${appUrl}${C.reset} and sign in:`);
  if (seed) {
    console.log(`     • Click ${C.bold}Explore the demo${C.reset} — one-click demo login with seeded data`);
  }
  console.log("     • Or use a magic link (printed in the server log when no email");
  console.log("       transport is configured — set RESEND_API_KEY to receive it by mail)");
  console.log("");
  console.log(`  ${C.bold}3. Connect Instagram (optional for local play):${C.reset}`);
  console.log("     Demo mode works without Meta. For real accounts set in .env:");
  console.log(`     ${C.dim}META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN${C.reset}`);
  console.log(`     Full guide: ${C.cyan}docs/meta-setup.md${C.reset}`);
  console.log("");
  console.log(`  ${C.bold}4. Optional: AI features${C.reset} — set ${C.dim}AI_PROVIDER${C.reset} + a key in .env`);
  console.log("");
  console.log(`  ${C.bold}Useful:${C.reset}`);
  console.log(`     • Docs:  ${C.cyan}docs/${C.reset} (setup, architecture, deployment, security…)`);
  console.log(`     • Tests: ${C.cyan}npm run test${C.reset}   •  Typecheck: ${C.cyan}npm run typecheck${C.reset}`);
  console.log(`     • Lint:  ${C.cyan}npm run lint${C.reset}   •  Build:    ${C.cyan}npm run build${C.reset}`);
  console.log("");
  console.log(`  ${C.bold}Stuck?${C.reset} See ${C.cyan}docs/troubleshooting.md${C.reset} or open a GitHub issue.`);
  console.log("");
}

// ── CLI ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const withSeed = args.includes("--seed");
const skipDocker = args.includes("--no-docker");

console.log(C.bold + "Leonyx Flow — setup" + C.reset);
console.log("");

try {
  ensureEnvFile();
  if (!skipDocker) {
    ensureDocker();
    startServices();
    waitForServices();
  } else {
    note("--no-docker: skipping container setup — make sure Postgres + Redis are reachable.");
  }
  migrate();
  if (withSeed) seedDemo();
  printNextSteps(withSeed);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}