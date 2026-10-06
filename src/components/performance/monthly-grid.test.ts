import { describe, expect, it } from "vitest";
import type { PerformanceRow } from "@/lib/types";
import { buildMonthlyGrid } from "./monthly-grid";

const row = (overrides: Partial<PerformanceRow>): PerformanceRow => ({
  id: 1,
  document_id: "d",
  document_name: "doc.pdf",
  manager: null,
  web_view_link: null,
  fund_name: "Fund A",
  share_class: null,
  period_type: "month",
  period_label: "",
  period_start: null,
  period_end: "2026-01-31",
  return_pct: 1,
  benchmark_name: null,
  benchmark_return_pct: null,
  is_annualized: null,
  net_or_gross: "net",
  currency: null,
  ...overrides,
});

describe("buildMonthlyGrid", () => {
  it("pivots monthly rows into year → fund → month, newest year first", () => {
    const grid = buildMonthlyGrid([
      row({ period_end: "2026-01-31", return_pct: 1.1 }),
      row({ period_end: "2026-02-28", return_pct: -0.2 }),
      row({ period_end: "2025-12-31", return_pct: 0.4 }),
      row({ fund_name: "Fund B", share_class: "I", period_end: "2026-01-31", return_pct: 3.4 }),
    ]);
    expect(grid.map((g) => g.year)).toEqual(["2026", "2025"]);
    expect(grid[0].funds.map((f) => f.name)).toEqual(["Fund A", "Fund B — I"]);
    expect(grid[0].funds[0].months.slice(0, 3)).toEqual([1.1, -0.2, undefined]);
    expect(grid[1].funds[0].months[11]).toBe(0.4);
  });

  it("ignores non-monthly rows and rows without a period end", () => {
    expect(buildMonthlyGrid([row({ period_type: "ytd" }), row({ period_end: null })])).toEqual([]);
  });
});
