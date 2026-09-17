// Verifies scripts/init.ts fresh-install env generation WITHOUT touching the
// real .env: copies project to a temp dir, runs init there, checks secrets.
import { execSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, mkdtempSync, symlinkSync } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const tmp = mkdtempSync(path.join(os.tmpdir(), "lf-init-"));
try {
  // Copy only what init needs: package.json, .env.example, prisma, scripts,
  // node_modules (symlink-ish copy is heavy — instead run with cwd=tmp and
  // resolve npx from the real project via PATH).
  cpSync(path.resolve("package.json"), path.join(tmp, "package.json"));
  cpSync(path.resolve(".env.example"), path.join(tmp, ".env.example"));
  cpSync(path.resolve("scripts"), path.join(tmp, "scripts"), { recursive: true });
  cpSync(path.resolve("prisma"), path.join(tmp, "prisma"), { recursive: true });
  // Give the temp dir the project's dependencies (prisma CLI + engines).
  symlinkSync(path.resolve("node_modules"), path.join(tmp, "node_modules"), "junction");

  const out = execSync("npm run init -- --no-docker", {
    cwd: tmp,
    env: { ...process.env, NODE_ENV: "development" },
    encoding: "utf8",
  });
  const env = readFileSync(path.join(tmp, ".env"), "utf8");
  const secret = (k: string) => env.split("\n").find((l) => l.startsWith(`${k}=`))?.split("=").slice(1).join("=") ?? "";

  const checks = {
    ".env created": existsSync(path.join(tmp, ".env")),
    "SESSION_SECRET generated (not placeholder)": secret("SESSION_SECRET").length >= 32 && !secret("SESSION_SECRET").includes("change-me"),
    "ENCRYPTION_KEY generated": secret("ENCRYPTION_KEY").length >= 32,
    "META_VERIFY_TOKEN generated": secret("META_VERIFY_TOKEN").length >= 12 && !secret("META_VERIFY_TOKEN").includes("change-me"),
    "printed next steps": out.includes("Leonyx Flow is ready"),
  };
  let ok = true;
  for (const [k, v] of Object.entries(checks)) {
    console.log(`${v ? "PASS" : "FAIL"}  ${k}`);
    if (!v) ok = false;
  }
  process.exit(ok ? 0 : 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}