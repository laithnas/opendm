import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

// Test setup: point Prisma at a disposable test database, migrate it, and
// provide a reset helper so DB tests start from a clean slate.

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://leonyx:leonyx@localhost:5432/leonyx_flow_test?schema=public";

process.env.DATABASE_URL = TEST_DATABASE_URL;

// Ensure the schema exists before any test touches the client.
try {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
} catch (err) {
  // Best-effort: if migration already ran this is a no-op; real failures
  // surface on the first query.
  console.warn("migrate deploy skipped:", err instanceof Error ? err.message.slice(0, 140) : String(err));
}

export const prisma = new PrismaClient();

/** Truncate every business table (keeps _prisma_migrations). */
export async function resetDb(): Promise<void> {
  const tableNames = (
    await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `
  ).map((r) => r.tablename);
  if (tableNames.length === 0) return;
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "${tableNames.join('", "')}" RESTART IDENTITY CASCADE`,
  );
}

export { TEST_DATABASE_URL };