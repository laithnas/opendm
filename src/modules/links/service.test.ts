import { describe, it, expect } from "vitest";
import { validateDestination } from "@/modules/links/service";
import { AppError } from "@/lib/errors";

describe("tracked-link destination validation (open-redirect / SSRF guard)", () => {
  it("accepts public https URLs", () => {
    expect(validateDestination("https://example.com/resource?utm=x")).toBe("https://example.com/resource?utm=x");
    expect(validateDestination("http://leonyx-ai.com/pricing")).toContain("leonyx-ai.com");
  });

  it("rejects non-http protocols", () => {
    for (const bad of ["javascript:alert(1)", "file:///etc/passwd", "ftp://example.com/x", "data:text/html,hi"]) {
      expect(() => validateDestination(bad)).toThrow(AppError);
    }
  });

  it("rejects localhost and private networks", () => {
    for (const bad of [
      "https://localhost:3000/x",
      "http://127.0.0.1/x",
      "http://10.0.0.5/x",
      "http://192.168.1.1/x",
      "http://172.16.0.1/x",
      "http://169.254.169.254/latest/meta-data", // cloud metadata SSRF
    ]) {
      expect(() => validateDestination(bad), bad).toThrow(AppError);
    }
  });

  it("rejects URLs with embedded credentials", () => {
    expect(() => validateDestination("https://user:pass@example.com/x")).toThrow(AppError);
  });

  it("rejects invalid URLs", () => {
    expect(() => validateDestination("not a url")).toThrow(AppError);
  });
});