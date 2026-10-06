import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import { ExtractionSchema, normalizeDate } from "./schema";

describe("normalizeDate", () => {
  it.each([
    ["2026-01-31", "2026-01-31"],
    ["2024-02-29", "2024-02-29"],
    ["2025-02-29", null], // not a leap year
    ["2026-13-01", null],
    ["31/01/2026", null],
    ["", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });
});

describe("ExtractionSchema", () => {
  it("converts to a structured-output JSON schema", () => {
    const format = betaZodOutputFormat(ExtractionSchema);
    expect(format.type).toBe("json_schema");
  });

  it("accepts a minimal extraction", () => {
    const result = ExtractionSchema.safeParse({
      document_type: "fund_factsheet",
      title: "Acme Global Equity — January 2026",
      manager: "Acme AM",
      as_of_date: "2026-01-31",
      currency: "USD",
      summary: "Monthly factsheet.",
      funds: [],
      performance: [
        {
          fund_name: "Acme Global Equity",
          share_class: null,
          period_type: "month",
          period_label: "Jan 2026",
          period_start: "2026-01-01",
          period_end: "2026-01-31",
          return_pct: 2.1,
          benchmark_name: null,
          benchmark_return_pct: null,
          is_annualized: false,
          net_or_gross: "net",
        },
      ],
      metrics: [],
    });
    expect(result.success).toBe(true);
  });
});
