import { describe, it, expect } from "vitest";
import { renderTemplate, uniqueVariables } from "@/modules/engine/render";

describe("renderTemplate", () => {
  it("renders all variables", () => {
    const out = renderTemplate("Hi {{username}} ({{name}})! You said: {{comment}}. Keyword: {{keyword}} — {{link}} — {{workspace}}", {
      username: "mike",
      name: "Mike",
      comment: "GUIDE",
      keyword: "guide",
      link: "https://x.test/l/abc",
      workspace: "Demo Studio",
    });
    expect(out).toContain("Hi mike (Mike)!");
    expect(out).toContain("You said: GUIDE.");
    expect(out).toContain("Keyword: guide");
    expect(out).toContain("https://x.test/l/abc");
    expect(out).toContain("Demo Studio");
  });

  it("renders missing variables as empty strings", () => {
    expect(renderTemplate("Hi {{username}}", {})).toBe("Hi ");
  });

  it("tolerates whitespace inside braces", () => {
    expect(renderTemplate("Hey {{ username }}", { username: "x" })).toBe("Hey x");
  });

  it("leaves unknown variables intact", () => {
    expect(renderTemplate("{{unknown_var}}", { username: "x" })).toBe("{{unknown_var}}");
  });

  it("keeps non-variable text untouched", () => {
    expect(renderTemplate("Sent it 👊", {})).toBe("Sent it 👊");
  });
});

describe("uniqueVariables", () => {
  it("extracts distinct variable names", () => {
    const vars = uniqueVariables("{{username}} and {{USERNAME}} and {{link}}");
    expect(vars.sort()).toEqual(["link", "username"]);
  });
});