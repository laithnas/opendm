import { InstagramProvider } from "@/modules/instagram/adapter";
import { MockInstagramProvider } from "@/modules/instagram/mock";
import type { SocialProvider } from "@/modules/providers/types";

// Provider registry — future providers register here and stay documented in
// docs/roadmap as roadmap items until their adapter is implemented.

const registry = new Map<string, SocialProvider>();
register(new InstagramProvider());
register(new MockInstagramProvider());

export function register(provider: SocialProvider): void {
  registry.set(provider.kind, provider);
}

export function getSocialProvider(kind: string): SocialProvider {
  const provider = registry.get(kind);
  if (!provider) throw new Error(`No adapter registered for provider "${kind}"`);
  return provider;
}

/** Providers with a functioning adapter (Instagram = v1). */
export function supportedProviders(): string[] {
  return ["instagram"];
}

/** Roadmap providers surfaced honestly in the UI as "coming soon". */
export function roadmapProviders(): { kind: string; name: string }[] {
  return [
    { kind: "facebook", name: "Facebook" },
    { kind: "whatsapp", name: "WhatsApp" },
    { kind: "tiktok", name: "TikTok" },
    { kind: "linkedin", name: "LinkedIn" },
    { kind: "x", name: "X" },
  ];
}

/** Demo/test mode provider. */
export function demoProvider(): SocialProvider {
  return new MockInstagramProvider();
}

export function isMockProvider(provider: SocialProvider): boolean {
  return provider instanceof MockInstagramProvider;
}