import type { AutomationCondition } from "@prisma/client";
import type { NormalizedEvent } from "@/modules/providers/types";

// Condition evaluation. Pure functions — unit-testable without a database.

export interface ConditionContext {
  event: NormalizedEvent;
  /** Follower status when the provider exposes it; undefined = unknown. */
  isFollower?: boolean | null;
  keyword?: string | null;
  contactTags?: string[];
}

export interface ConditionVerdict {
  pass: boolean;
  reason?: string;
  /** The keyword that matched, for analytics/rendering ({ {keyword} }). */
  keyword?: string | null;
}

// ── Keyword matching ──────────────────────────────────────────────────────

export interface KeywordConfig {
  keywords: string[];
  matchAny: boolean; // false = ALL keywords must be present
  caseInsensitive: boolean;
  wholeWord: boolean;
}

export function keywordMatches(text: string, cfg: KeywordConfig): string | null {
  if (!cfg.keywords.length) return null;
  const haystack = cfg.caseInsensitive ? text.toLowerCase() : text;
  const terms = cfg.keywords.map((k) => (cfg.caseInsensitive ? k.trim().toLowerCase() : k.trim())).filter(Boolean);
  if (!terms.length) return null;
  const found: string[] = [];
  for (const term of terms) {
    if (cfg.wholeWord) {
      if (containsWholeWord(haystack, term, cfg.caseInsensitive)) found.push(term);
    } else if (haystack.includes(term)) {
      found.push(term);
    }
  }
  if (cfg.matchAny) return found.length > 0 ? (found[0] ?? null) : null;
  return found.length === terms.length ? (found[0] ?? null) : null;
}

function containsWholeWord(text: string, term: string, caseInsensitive: boolean): boolean {
  if (!term) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`, caseInsensitive ? "i" : "").test(text);
}

// ── Individual condition evaluation ───────────────────────────────────────

export function evaluateSingleCondition(condition: AutomationCondition, ctx: ConditionContext): ConditionVerdict {
  const config = (condition.config ?? {}) as Record<string, unknown>;
  switch (condition.kind) {
    case "KEYWORD_MATCH": {
      const keyword = keywordMatches(ctx.event.text, config as unknown as KeywordConfig);
      if (!keyword) {
        return { pass: false, reason: "no keyword matched" };
      }
      return { pass: true, keyword };
    }
    case "EXCLUDE_KEYWORDS": {
      const hit = keywordMatches(ctx.event.text, config as unknown as KeywordConfig);
      if (hit) return { pass: false, reason: `excluded keyword present: "${hit}"` };
      return { pass: true };
    }
    case "POST_MATCH": {
      const postSelection = config.postSelection ?? "any";
      const postRef = typeof config.postRef === "string" ? config.postRef : null;
      if (postSelection === "any" || !postRef) return { pass: true };
      const mediaId = ctx.event.mediaId ?? null;
      if (mediaId && mediaId === postRef) return { pass: true };
      return { pass: false, reason: `comment is not on the selected post (${postRef})` };
    }
    case "FOLLOWERS_ONLY": {
      const requireFollow = Boolean(config.requireFollow);
      if (!requireFollow) return { pass: true };
      if (ctx.isFollower === true) return { pass: true };
      if (ctx.isFollower === false) return { pass: false, reason: "author is not a follower" };
      return {
        pass: false,
        reason: "follower status unavailable — requires Meta advanced access (ig_manage_comments with public content access)",
      };
    }
    case "ALL":
    default:
      return { pass: true };
  }
}

export interface AutomationConditionsBundle {
  conditions: AutomationCondition[];
  triggerConfig: Record<string, unknown>;
}

/**
 * Evaluate the trigger config + all enabled conditions. Every condition must
 * pass for the automation to run.
 */
export function evaluateConditions(bundle: AutomationConditionsBundle, ctx: ConditionContext): ConditionVerdict {
  // Trigger-config-level constraints (kept for backwards-compatible
  // single-config automations imported from v1 payloads).
  const trigger = bundle.triggerConfig;
  if (trigger.matchAnyPost === false && typeof trigger.postRef === "string" && trigger.postRef) {
    const mediaId = ctx.event.mediaId ?? null;
    if (mediaId && mediaId !== trigger.postRef) {
      return { pass: false, reason: `comment is not on the selected post (${trigger.postRef})` };
    }
  }
  const tgKeywords = Array.isArray(trigger.keywords) ? (trigger.keywords as string[]) : [];
  const tgExcludes = Array.isArray(trigger.excludeKeywords) ? (trigger.excludeKeywords as string[]) : [];
  const tgText = ctx.event.text;
  if (tgKeywords.length) {
    const keyword = keywordMatches(tgText, {
      keywords: tgKeywords,
      matchAny: trigger.matchAnyWord === true,
      caseInsensitive: trigger.caseInsensitive !== false,
      wholeWord: trigger.wholeWord !== false,
    });
    if (!keyword) return { pass: false, reason: "trigger keywords did not match" };
    if (tgExcludes.length) {
      const excluded = keywordMatches(tgText, {
        keywords: tgExcludes,
        matchAny: true,
        caseInsensitive: true,
        wholeWord: true,
      });
      if (excluded) return { pass: false, reason: `excluded keyword present: "${excluded}"` };
    }
  }

  const enabled = bundle.conditions.filter((c) => c.enabled);
  let firstKeyword: string | null = null;
  for (const condition of enabled) {
    const verdict = evaluateSingleCondition(condition, ctx);
    if (!verdict.pass) return verdict;
    if (verdict.keyword) firstKeyword = verdict.keyword;
  }
  return { pass: true, keyword: firstKeyword };
}