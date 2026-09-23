import { z } from "zod";

// Zod schemas for automation config at the API boundary and for
// export/import validation. Import uses .strict() — unknown keys reject the
// payload so a malformed community template fails loudly, never silently.

export const triggerConfigSchema = z.object({
  matchAnyPost: z.boolean().optional(),
  postRef: z.string().max(200).nullable().optional(),
  keywords: z.array(z.string().max(100)).max(30).optional(),
  matchAnyWord: z.boolean().optional(),
  caseInsensitive: z.boolean().optional(),
  wholeWord: z.boolean().optional(),
  excludeKeywords: z.array(z.string().max(100)).max(30).optional(),
  followerGate: z.boolean().optional(),
});

export const keywordConditionConfigSchema = z
  .object({
    keywords: z.array(z.string().max(100)).min(1).max(30),
    matchAny: z.boolean().optional().default(false),
    caseInsensitive: z.boolean().optional().default(true),
    wholeWord: z.boolean().optional().default(true),
  })
  .strict();

export const excludeConditionConfigSchema = z
  .object({
    keywords: z.array(z.string().max(100)).min(1).max(30),
    matchAny: z.boolean().optional().default(true),
    caseInsensitive: z.boolean().optional().default(true),
    wholeWord: z.boolean().optional().default(true),
  })
  .strict();

export const postConditionConfigSchema = z
  .object({
    postSelection: z.enum(["any", "specific"]).optional().default("any"),
    postRef: z.string().max(200).nullable().optional(),
  })
  .strict();

export const followerConditionConfigSchema = z
  .object({
    requireFollow: z.boolean().optional().default(true),
  })
  .strict();

export const conditionSchema = z
  .object({
    kind: z.enum(["KEYWORD_MATCH", "EXCLUDE_KEYWORDS", "POST_MATCH", "FOLLOWERS_ONLY", "ALL"]),
    config: z.record(z.string(), z.unknown()),
    order: z.number().int().min(0).max(100).optional().default(0),
    enabled: z.boolean().optional().default(true),
  })
  .strict();

export const ctaButtonSchema = z
  .object({
    title: z.string().min(1).max(36),
    payload: z.string().max(1000).optional(),
  })
  .strict();

export const sendDmActionConfigSchema = z
  .object({
    text: z.string().min(1).max(1000),
    ctaButtons: z.array(ctaButtonSchema).max(3).optional(),
  })
  .strict();

export const sendLinkActionConfigSchema = z
  .object({
    text: z.string().min(0).max(1000).optional().default("Here you go: {{link}}"),
    linkSlug: z.string().optional(),
    linkName: z.string().max(200).optional(),
    linkDestination: z.string().url().max(2048).optional(),
    ctaButtons: z.array(ctaButtonSchema).max(3).optional(),
  })
  .strict();

export const publicReplyActionConfigSchema = z
  .object({
    text: z.string().min(1).max(1000),
  })
  .strict();

export const addTagActionConfigSchema = z
  .object({
    tag: z.string().min(1).max(50),
  })
  .strict();

export const webhookActionConfigSchema = z
  .object({
    // Only http(s) — javascript:/data: URLs are rejected up front.
    url: z.string().url().max(2048).refine((v) => v.startsWith("http://") || v.startsWith("https://"), "Only http(s) webhook URLs are allowed"),
    secret: z.string().max(500).optional(),
    payloadTemplate: z.string().max(2000).optional(),
  })
  .strict();

export const delayActionConfigSchema = z
  .object({
    ms: z.number().int().min(0).max(1000 * 60 * 60 * 24 * 7),
  })
  .strict();

// "Follow me, tap the button, get the link" — a friction step, not a real
// verified gate (Meta's API has no "does user X follow me" endpoint; see
// docs/meta-setup.md). gateText/gateButtonLabel are the follow-prompt DM;
// finalText is sent once the button is tapped, no check performed.
export const followGateActionConfigSchema = z
  .object({
    // Stage 0 — sent immediately when the trigger fires.
    promptText: z.string().min(1).max(1000),
    promptButtonLabel: z.string().min(1).max(20).default("Yes! Send It"),
    // Stage 1 — sent once the stage-0 button is tapped.
    gateText: z.string().min(1).max(1000),
    gateButtonLabel: z.string().min(1).max(20).default("I Followed"),
    // Stage 2 — sent once the stage-1 button is tapped. No check performed.
    finalText: z.string().min(1).max(1000),
  })
  .strict();

export const actionSchema = z
  .object({
    kind: z.enum(["SEND_DM", "PUBLIC_REPLY", "SEND_LINK", "ADD_TAG", "CALL_WEBHOOK", "DELAY", "FOLLOW_GATE"]),
    config: z.record(z.string(), z.unknown()),
    order: z.number().int().min(0).max(100).optional().default(0),
    enabled: z.boolean().optional().default(true),
    delayMs: z.number().int().min(0).max(1000 * 60 * 60 * 24 * 7).optional().default(0),
  })
  .strict();

export const automationInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional().nullable(),
    triggerType: z.enum(["COMMENT", "DM", "STORY_REPLY"]),
    triggerConfig: triggerConfigSchema.optional().default({}),
    conditions: z.array(conditionSchema).max(20).optional().default([]),
    actions: z.array(actionSchema).max(20).optional().default([]),
  })
  .strict();

export type AutomationInput = z.infer<typeof automationInputSchema>;
export type ConditionInput = z.infer<typeof conditionSchema>;
export type ActionInput = z.infer<typeof actionSchema>;

// ── Per-kind config validation (runtime boundary) ─────────────────────────

export function validateActionConfig(kind: string, config: Record<string, unknown>): void {
  switch (kind) {
    case "SEND_DM": {
      const result = sendDmActionConfigSchema.safeParse({
        text: config.text ?? "",
        ctaButtons: Array.isArray(config.ctaButtons) && config.ctaButtons.length ? config.ctaButtons : undefined,
      });
      if (!result.success) throw new Error(`Invalid SEND_DM config: ${result.error.message}`);
      break;
    }
    case "SEND_LINK": {
      const result = sendLinkActionConfigSchema.safeParse({
        text: config.text,
        linkSlug: config.linkSlug ?? undefined,
        linkName: config.linkName ?? undefined,
        linkDestination: config.linkDestination ?? undefined,
        ctaButtons: config.ctaButtons,
      });
      if (!result.success) throw new Error(`Invalid SEND_LINK config: ${result.error.message}`);
      break;
    }
    case "PUBLIC_REPLY": {
      const result = publicReplyActionConfigSchema.safeParse({ text: config.text ?? "" });
      if (!result.success) throw new Error(`Invalid PUBLIC_REPLY config: ${result.error.message}`);
      break;
    }
    case "ADD_TAG": {
      const result = addTagActionConfigSchema.safeParse({ tag: config.tag ?? "" });
      if (!result.success) throw new Error(`Invalid ADD_TAG config: ${result.error.message}`);
      break;
    }
    case "CALL_WEBHOOK": {
      if (typeof config.payloadTemplate === "string" && config.payloadTemplate.length > 2000) {
        throw new Error("Invalid CALL_WEBHOOK config: payloadTemplate too long");
      }
      const result = webhookActionConfigSchema.safeParse({ url: config.url, secret: config.secret });
      if (!result.success) throw new Error(`Invalid CALL_WEBHOOK config: ${result.error.message}`);
      break;
    }
    case "DELAY": {
      const result = delayActionConfigSchema.safeParse({ ms: config.ms ?? 0 });
      if (!result.success) throw new Error(`Invalid DELAY config: ${result.error.message}`);
      break;
    }
    case "FOLLOW_GATE": {
      const result = followGateActionConfigSchema.safeParse({
        promptText: config.promptText ?? "",
        promptButtonLabel: config.promptButtonLabel,
        gateText: config.gateText ?? "",
        gateButtonLabel: config.gateButtonLabel,
        finalText: config.finalText ?? "",
      });
      if (!result.success) throw new Error(`Invalid FOLLOW_GATE config: ${result.error.message}`);
      break;
    }
  }
}

export function validateConditionConfig(kind: string, config: Record<string, unknown>): void {
  switch (kind) {
    case "KEYWORD_MATCH":
      keywordConditionConfigSchema.parse(config);
      break;
    case "EXCLUDE_KEYWORDS":
      excludeConditionConfigSchema.parse(config);
      break;
    case "POST_MATCH":
      postConditionConfigSchema.parse(config);
      break;
    case "FOLLOWERS_ONLY":
      followerConditionConfigSchema.parse(config);
      break;
  }
}

// ── Export / import payload (portable automation JSON) ─────────────────────

export const exportPayloadSchema = z
  .object({
    schema: z.literal("leonyx.flow.automation"),
    schemaVersion: z.literal(1),
    exportedAt: z.string().datetime().optional(),
    automation: automationInputSchema,
  })
  .strict();

export type ExportPayload = z.infer<typeof exportPayloadSchema>;