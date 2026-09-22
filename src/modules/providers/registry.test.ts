import { describe, it, expect } from "vitest";
import { getSocialProvider, getProviderForConnection } from "@/modules/providers/registry";
import { InstagramProvider } from "@/modules/instagram/adapter";
import { MockInstagramProvider } from "@/modules/instagram/mock";

// Regression: the mock and real adapters used to share the registry key
// "instagram" — whichever registered second silently shadowed the other for
// every lookup, so real connections were secretly calling the mock adapter.

describe("provider registry", () => {
  it("getSocialProvider('instagram') is the real adapter, not the mock", () => {
    expect(getSocialProvider("instagram")).toBeInstanceOf(InstagramProvider);
  });

  it("routes a real connection to the real adapter", () => {
    const provider = getProviderForConnection({ provider: "INSTAGRAM", meta: {} });
    expect(provider).toBeInstanceOf(InstagramProvider);
  });

  it("routes a demo connection (meta.demo === true) to the mock adapter", () => {
    const provider = getProviderForConnection({ provider: "INSTAGRAM", meta: { demo: true } });
    expect(provider).toBeInstanceOf(MockInstagramProvider);
  });

  it("treats a missing/null meta as a real connection", () => {
    expect(getProviderForConnection({ provider: "INSTAGRAM" })).toBeInstanceOf(InstagramProvider);
    expect(getProviderForConnection({ provider: "INSTAGRAM", meta: null })).toBeInstanceOf(InstagramProvider);
  });
});
