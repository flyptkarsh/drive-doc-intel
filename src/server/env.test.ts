import { describe, expect, it } from "vitest";
import { isSignInAllowed, missingRequiredEnv } from "./env";

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

describe("missingRequiredEnv", () => {
  it("lists unset required variables with their purpose", () => {
    const missing = missingRequiredEnv({
      DATABASE_URL: "postgres://localhost/x",
      GOOGLE_CLIENT_ID: "id",
      SESSION_SECRET: "s",
      ANTHROPIC_API_KEY: "",
    });
    expect(missing).toEqual([
      "GOOGLE_CLIENT_SECRET: Google OAuth client secret (Drive access)",
      "ANTHROPIC_API_KEY: Claude API key (extraction and Ask)",
    ]);
  });

  it("is empty when everything is set", () => {
    const env = {
      DATABASE_URL: "a",
      GOOGLE_CLIENT_ID: "b",
      GOOGLE_CLIENT_SECRET: "c",
      ANTHROPIC_API_KEY: "d",
      SESSION_SECRET: "e",
    };
    expect(missingRequiredEnv(env)).toEqual([]);
  });
});
