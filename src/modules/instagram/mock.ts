import type { SocialConnection } from "@prisma/client";
import type {
  NormalizedEvent,
  OutboundMessageInput,
  OutboundMessageResult,
  ProviderAccountInfo,
  ProviderCtx,
  PublicReplyInput,
  PublicReplyResult,
  SocialProvider,
} from "@/modules/providers/types";

// Mock Instagram provider for demo mode and tests: no network, realistic
// behavior, deliberate failure injection.
//
// Failure injection convention (used by tests and the demo "test send"):
//   - text containing "<fail>" → sendDm throws ProviderError.
//   - text containing "<ratelimit>" → throws a rate-limit style ProviderError.

export class MockInstagramProvider implements SocialProvider {
  // Distinct from the real "instagram" adapter's kind — sharing a key meant
  // whichever registered second silently shadowed the other for every
  // lookup, real connections included. Selected via getProviderForConnection.
  kind = "instagram-mock" as const;
  displayName = "Instagram (mock)";

  capabilities = {
    ctaButtons: true,
    storyReplies: true,
    commentReplies: true,
    whispers: {
      label: "Messaging window",
      description: "Instagram allows business messages only inside the 7-day messaging window since the user's last message.",
    },
  };

  async sendDm(_ctx: ProviderCtx, _to: { externalId: string }, input: OutboundMessageInput): Promise<OutboundMessageResult> {
    await delay(40);
    if (input.text.includes("<fail>")) {
      throw Object.assign(new Error("Mock provider: injectable failure"), { providerCode: "MOCK_FAIL" });
    }
    if (input.text.includes("<ratelimit>")) {
      throw Object.assign(new Error("Mock provider: rate limited"), { providerCode: "613" });
    }
    return { externalMessageId: `mock-msg-${Math.random().toString(36).slice(2, 10)}` };
  }

  async sendPublicReply(_ctx: ProviderCtx, _input: PublicReplyInput): Promise<PublicReplyResult> {
    await delay(40);
    if (_input.text.includes("<fail>")) {
      throw Object.assign(new Error("Mock provider: injectable failure"), { providerCode: "MOCK_FAIL" });
    }
    return { externalReplyId: `mock-reply-${Math.random().toString(36).slice(2, 10)}` };
  }

  async fetchAccount(_ctx: ProviderCtx): Promise<ProviderAccountInfo> {
    await delay(30);
    return {
      externalId: _ctx.connection.externalAccountId,
      username: _ctx.connection.username,
      displayName: _ctx.connection.displayName ?? _ctx.connection.username,
      followersCount: 12_430,
    };
  }

  parseWebhook(payload: unknown): NormalizedEvent[] {
    // Accept normalized events directly for test/demo injection, or a
    // simulated Meta envelope {"entry":[...],"object":"instagram"}.
    if (Array.isArray(payload)) return payload as NormalizedEvent[];
    const candidate = payload as { events?: NormalizedEvent[] };
    if (candidate.events) return candidate.events;
    return [];
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}