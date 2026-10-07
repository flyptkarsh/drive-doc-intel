import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import { ExtractionSchema, normalizeDate, toExtraction, type ModelExtraction } from "./schema";

/** Structured outputs reject schemas with more than this many union-typed parameters. */
const MAX_UNION_PARAMETERS = 16;

/** Counts schema nodes with `anyOf` or a type array, as the API does. */
function countUnions(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((n, child) => n + countUnions(child), 0);
  if (!node || typeof node !== "object") return 0;
  const obj = node as Record<string, unknown>;
  const self = "anyOf" in obj || Array.isArray(obj.type) ? 1 : 0;
  return self + Object.values(obj).reduce<number>((n, child) => n + countUnions(child), 0);
}

const sample: ModelExtraction = {
  document_type: "fund_factsheet",
  title: "Acme Global Equity — January 2026",
  manager: "Acme AM",
  as_of_date: "2026-01-31",
  currency: "",
  summary: "Monthly factsheet.",
  funds: [
    {
      fund_name: "Acme Global Equity",
      share_class: "I USD",
      isin: "",
      ticker: " ",
      strategy: "",
      asset_class: "Equity",
    },
  ],
  performance: [
    {
      fund_name: "Acme Global Equity",
      share_class: "",
      period_type: "month",
      period_label: "Jan 2026",
      period_start: "2026-01-01",
      period_end: "2026-01-31",
      return_pct: 2.1,
      benchmark_name: "",
      benchmark_return_pct: null,
      is_annualized: false,
      net_or_gross: "net",
    },
  ],
  metrics: [
    {
      fund_name: "",
      name: "aum",
      value_number: 1820,
      value_text: "",
      unit: "USD millions",
      as_of_date: "",
    },
  ],
};

describe("ExtractionSchema", () => {
  it(`stays within the structured-output limit of ${MAX_UNION_PARAMETERS} union parameters`, () => {
    const { schema } = betaZodOutputFormat(ExtractionSchema);
    expect(countUnions(schema)).toBeLessThanOrEqual(MAX_UNION_PARAMETERS);
  });

  it("accepts a model response", () => {
    expect(ExtractionSchema.safeParse(sample).success).toBe(true);
  });
});

describe("toExtraction", () => {
  it("turns empty or blank text into null and keeps everything else", () => {
    const x = toExtraction(sample);
    expect(x.manager).toBe("Acme AM");
    expect(x.currency).toBeNull();
    expect(x.funds[0]).toMatchObject({
      share_class: "I USD",
      isin: null,
      ticker: null,
      strategy: null,
      asset_class: "Equity",
    });
    expect(x.performance[0]).toMatchObject({
      share_class: null,
      benchmark_name: null,
      benchmark_return_pct: null,
      period_end: "2026-01-31",
      return_pct: 2.1,
    });
    expect(x.metrics[0]).toMatchObject({
      fund_name: null,
      value_text: null,
      as_of_date: null,
      value_number: 1820,
    });
  });
});

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
