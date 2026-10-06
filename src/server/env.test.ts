import { describe, expect, it } from "vitest";
import { isSignInAllowed } from "./env";

describe("isSignInAllowed", () => {
  it("allows everyone when the allow-list is empty", () => {
    expect(isSignInAllowed("anyone@example.com", [])).toBe(true);
  });

  it("matches exact emails case-insensitively", () => {
    expect(isSignInAllowed("Pat@Example.com", ["pat@example.com"])).toBe(true);
    expect(isSignInAllowed("other@example.com", ["pat@example.com"])).toBe(false);
  });

  it("matches @domain rules", () => {
    expect(isSignInAllowed("a@loungefrog.com", ["@loungefrog.com"])).toBe(true);
    expect(isSignInAllowed("a@notloungefrog.com", ["@loungefrog.com"])).toBe(false);
  });
});
