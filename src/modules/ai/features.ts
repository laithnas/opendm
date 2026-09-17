import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getAIProvider, isAIEnabled } from "@/modules/ai/provider";
import type { AutomationInput } from "@/modules/automations/schema";
import { keywordConditionConfigSchema } from "@/modules/automations/schema";

// AI features. Every function returns drafts the user explicitly applies —
// AI output is never injected into automations or messages automatically.

type Feature = "rewrite" | "campaign-gen" | "suggestion" | "insight" | "classify";

async function runFeature(
  input: { workspaceId: string; userId: string; feature: Feature },
  system: string,
  user: string,
  maxTokens = 1024,
): Promise<string> {
  if (!isAIEnabled()) {
    throw new AppError(
      "AI is not configured on this instance. Set AI_PROVIDER and a matching API key in .env.",
      400,
      "AI_NOT_CONFIGURED",
    );
  }
  const provider = getAIProvider();
  const result = await provider.complete(system, user, maxTokens);
  await prisma.aIUsage.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      provider: provider.name,
      model: provider.model,
      feature: input.feature,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    },
  });
  return result.text.trim();
}

// ── 1. Message rewrite ────────────────────────────────────────────────────

export type RewriteTone = "shorter" | "friendlier" | "professional" | "higher-conversion" | "creator";

const TONE_GUIDANCE: Record<RewriteTone, string> = {
  shorter: "Make it noticeably shorter. Remove filler. Keep every fact.",
  friendlier: "Make it warmer and more conversational, without being fake.",
  professional: "Make it polished, confident and business-appropriate.",
  "higher-conversion": "Make it more action-oriented and persuasive, with one clear call to action.",
  creator: "Make it sound like a creator talking to their audience — casual, personal, energetic.",
};

export async function rewriteMessage(
  input: {
    workspaceId: string;
    userId: string;
    text: string;
    tone: RewriteTone;
  },
): Promise<{ rewritten: string; tone: RewriteTone }> {
  const sys = "You rewrite social media customer messages. Output ONLY the rewritten message, no quotes, no preamble, no explanation.";
  const user = `Tone: ${TONE_GUIDANCE[input.tone]}\n\nOriginal message:\n"""\n${input.text}\n"""`;
  const rewritten = await runFeature({ ...input, feature: "rewrite" }, sys, user, 600);
  if (!rewritten) throw new AppError("AI returned an empty rewrite, try again", 502, "AI_EMPTY");
  return { rewritten, tone: input.tone };
}

// ── 2. Campaign generation ────────────────────────────────────────────────

export interface CampaignDraft {
  name: string;
  description: string;
  triggerType: "COMMENT" | "DM" | "STORY_REPLY";
  triggerConfig: Record<string, unknown>;
  conditions: AutomationInput["conditions"];
  actions: AutomationInput["actions"];
}

const CAMPAIGN_PROMPT = `You are an expert Instagram automation consultant. Design a complete automation for the business situation described by the user.

Respond with STRICT JSON only, matching this shape exactly:
{
  "name": "short name for the automation",
  "description": "one sentence",
  "triggerType": "COMMENT | DM | STORY_REPLY",
  "triggerConfig": { "matchAnyPost": false, "postRef": null, "keywords": ["..."], "matchAnyWord": false, "caseInsensitive": true, "wholeWord": true, "excludeKeywords": [], "followerGate": false },
  "conditions": [ { "kind": "KEYWORD_MATCH", "config": { "keywords": ["..."], "matchAny": false, "caseInsensitive": true, "wholeWord": true }, "order": 0, "enabled": true } ],
  "actions": [
    { "kind": "PUBLIC_REPLY", "config": { "text": "..." }, "order": 0, "enabled": true, "delayMs": 0 },
    { "kind": "SEND_DM", "config": { "text": "... use {{username}}, {{link}} variables", "ctaButtons": [{ "title": "Call to action" }] }, "order": 1, "enabled": true, "delayMs": 0 }
  ]
}

Rules:
- Keywords must be realistic words/abbreviations real people comment.
- Public reply and DM text must be natural, short, creator-tone.
- Prefer a KEYWORD_MATCH condition instead of stuffing keywords in triggerConfig.
- A tracked link should be placed via a "SEND_LINK" action with config { "text": "...{{link}}", "linkName": "Resource", "linkDestination": "https://example.com/resource" } when a link makes sense.
- Never send more than 2 messages per run.
- If followerGate is true explain why in description.`;

export async function generateCampaign(
  input: {
    workspaceId: string;
    userId: string;
    situation: string;
  },
): Promise<CampaignDraft> {
  const raw = await runFeature({ ...input, feature: "campaign-gen" }, CAMPAIGN_PROMPT, input.situation, 1500);
  const parsed = extractJson(raw);
  const required = ["name", "triggerType", "triggerConfig", "conditions", "actions"];
  for (const key of required) {
    if (!(key in parsed)) throw new AppError(`AI campaign generator returned incomplete output (missing "${key}")`, 502, "AI_MALFORMED");
  }
  return parsed as unknown as CampaignDraft;
}

function extractJson(raw: string): Record<string, unknown> {
  const stripped = raw.replace(/```(json)?/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) throw new AppError("AI returned non-JSON output", 502, "AI_MALFORMED");
  try {
    return JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new AppError("AI returned malformed JSON", 502, "AI_MALFORMED");
  }
}

// ── 3. Automation suggestions ─────────────────────────────────────────────

export interface Suggestion {
  title: string;
  description: string;
}

export async function automationSuggestions(
  input: { workspaceId: string; userId: string; context: { accountUsername?: string; automationCount: number } },
): Promise<Suggestion[]> {
  const sys = "You suggest Instagram automation ideas. Reply with STRICT JSON: an array of 3 objects {title, description}.";
  const user = `Account: ${input.context.accountUsername ?? "unknown"}\nExisting automations: ${input.context.automationCount}\nSuggest 3 high-impact automations for a growing creator/business account.`;
  const raw = await runFeature({ ...input, feature: "suggestion" }, sys, user, 700);
  const parsed = extractJson(raw);
  const arr = Array.isArray(parsed) ? parsed : parsed.suggestions;
  if (!Array.isArray(arr)) throw new AppError("AI returned malformed suggestions", 502, "AI_MALFORMED");
  return arr.slice(0, 3) as Suggestion[];
}

// ── 4. Analytics insight ──────────────────────────────────────────────────

export async function analyticsInsight(
  input: { workspaceId: string; userId: string; metrics: Record<string, unknown> },
): Promise<string> {
  const sys = "You are a social media analytics consultant. Explain the most important insight in 2-3 plain sentences. No fluff, no invented numbers.";
  const user = `Here are real metrics from the last 30 days: ${JSON.stringify(input.metrics)}`;
  return runFeature({ ...input, feature: "insight" }, sys, user, 300);
}

// ── 5. Intent classification (optional spam/lead triage) ─────────────────

export async function classifyMessage(
  input: { workspaceId: string; userId: string; text: string },
): Promise<{ label: "lead" | "question" | "spam" | "other"; confidence: number }> {
  const sys = `Classify the Instagram DM into one label: lead, question, spam, other. Reply with STRICT JSON {"label": "...", "confidence": 0.0-1.0}`;
  const raw = await runFeature({ ...input, feature: "classify" }, sys, input.text.slice(0, 500), 200);
  const parsed = extractJson(raw);
  const label = parsed.label as "lead" | "question" | "spam" | "other";
  if (!["lead", "question", "spam", "other"].includes(label)) {
    throw new AppError("AI returned an unknown intent label", 502, "AI_MALFORMED");
  }
  return { label, confidence: Number(parsed.confidence ?? 0.5) };
}

// Re-export for tests.
export { keywordConditionConfigSchema };