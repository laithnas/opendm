import { z } from "zod";

// All environment variables are validated at process start. A missing or
// malformed value fails fast instead of surfacing as a runtime mystery.

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().default("OpenDM"),
  COMPANY_NAME: z.string().default("Leonyx AI"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  SESSION_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(16),
  TOKEN_REFRESH_THRESHOLD_SECONDS: z.coerce.number().int().positive().default(3600),
  RESEND_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().default("OpenDM <no-reply@leonyx-ai.com>"),
  META_APP_ID: z.string().optional().default(""),
  META_APP_SECRET: z.string().optional().default(""),
  META_VERIFY_TOKEN: z.string().optional().default(""),
  META_GRAPH_VERSION: z.string().default("v21.0"),
  AI_PROVIDER: z.enum(["", "anthropic", "openai", "gemini"]).default(""),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  OPENAI_API_KEY: z.string().optional().default(""),
  GEMINI_API_KEY: z.string().optional().default(""),
  QUEUE_PREFIX: z.string().default("leonyx-flow"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(2),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(1000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

// Accept the variable names Vercel's Neon/Upstash marketplace integrations
// inject, so connecting either one from the Storage tab "just works" without
// hand-renaming env vars. Only fills in when DATABASE_URL/REDIS_URL are
// themselves unset — never overrides an explicit value.
const DATABASE_URL_FALLBACKS = ["POSTGRES_URL", "POSTGRES_PRISMA_URL", "DATABASE_URL_UNPOOLED"];
const REDIS_URL_FALLBACKS = ["KV_URL", "UPSTASH_REDIS_URL", "REDIS_TLS_URL"];

function resolveEnv(raw: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...raw };
  if (!out.DATABASE_URL) {
    for (const key of DATABASE_URL_FALLBACKS) {
      if (out[key]) {
        out.DATABASE_URL = out[key];
        break;
      }
    }
  }
  if (!out.REDIS_URL) {
    for (const key of REDIS_URL_FALLBACKS) {
      if (out[key]) {
        out.REDIS_URL = out[key];
        break;
      }
    }
  }
  return out;
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(resolveEnv(process.env));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

// Singleton — never re-parse on hot reloads.
export const env: Env = globalThis.__env ?? loadEnv();
declare global {
  // eslint-disable-next-line no-var
  var __env: Env | undefined;
}
if (process.env.NODE_ENV !== "production") {
  globalThis.__env = env;
}