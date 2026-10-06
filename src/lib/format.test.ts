import { describe, expect, it } from "vitest";
import { formatDate, formatPct, formatRelative, humanize, returnTone } from "./format";

describe("formatPct", () => {
  it("signs and rounds", () => {
    expect(formatPct(1.234)).toBe("+1.23%");
    expect(formatPct(-0.4)).toBe("-0.40%");
    expect(formatPct(0)).toBe("0.00%");
    expect(formatPct(2.25, 1)).toBe("+2.3%");
  });

  it("renders missing values as a dash", () => {
    expect(formatPct(null)).toBe("—");
    expect(formatPct(undefined)).toBe("—");
    expect(formatPct(Number.NaN)).toBe("—");
  });
});

describe("returnTone", () => {
  it("is green for gains, red for losses, muted otherwise", () => {
    expect(returnTone(1)).toContain("emerald");
    expect(returnTone(-1)).toContain("rose");
    expect(returnTone(0)).toBe("text-muted-foreground");
    expect(returnTone(null)).toBe("text-muted-foreground");
  });
});

describe("formatDate", () => {
  it("does not shift calendar dates across timezones", () => {
    expect(formatDate("2026-01-31")).toContain("31");
  });

  it("passes through unparseable input and dashes missing values", () => {
    expect(formatDate("Q1 2026")).toBe("Q1 2026");
    expect(formatDate(null)).toBe("—");
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  it.each([
    [null, "never"],
    ["2026-10-06T11:59:30Z", "just now"],
    ["2026-10-06T11:55:00Z", "5m ago"],
    ["2026-10-06T09:00:00Z", "3h ago"],
    ["2026-10-04T12:00:00Z", "2d ago"],
  ])("%s → %s", (input, expected) => {
    expect(formatRelative(input, now)).toBe(expected);
  });
});

describe("humanize", () => {
  it("turns snake_case into a sentence-case label", () => {
    expect(humanize("fund_factsheet")).toBe("Fund factsheet");
    expect(humanize(null)).toBe("—");
  });
});
