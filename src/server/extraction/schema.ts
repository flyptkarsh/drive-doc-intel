import { z } from "zod";

const PeriodType = z.enum([
  "month",
  "quarter",
  "ytd",
  "1y",
  "3y",
  "5y",
  "10y",
  "since_inception",
  "calendar_year",
  "other",
]);

const DocumentType = z.enum([
  "fund_factsheet",
  "account_statement",
  "performance_report",
  "investor_letter",
  "transaction_confirmation",
  "market_commentary",
  "other",
]);

// Structured outputs allow at most 16 union-typed (e.g. nullable) parameters per
// schema, so optional text is a plain string where "" means "not stated". Only
// numbers and booleans are nullable. toExtraction() maps "" back to null.
const optionalText = (description: string) =>
  z.string().describe(`${description}. Empty string if not stated`);
const optionalDate = (description: string) => optionalText(`${description}, YYYY-MM-DD`);

/** The one schema every document is extracted into, whatever its layout. */
export const ExtractionSchema = z.object({
  document_type: DocumentType,
  title: z.string().describe("A short human title for the document"),
  manager: optionalText("Asset manager, issuer, or custodian that produced it"),
  as_of_date: optionalDate("Reporting date"),
  currency: optionalText("Main reporting currency, ISO code"),
  summary: z.string().describe("2-4 sentence summary of what the document reports"),
  funds: z.array(
    z.object({
      fund_name: z.string(),
      share_class: optionalText("Share class"),
      isin: optionalText("ISIN"),
      ticker: optionalText("Ticker"),
      strategy: optionalText("Investment strategy"),
      asset_class: optionalText("Asset class"),
    }),
  ),
  performance: z.array(
    z.object({
      fund_name: z.string(),
      share_class: optionalText("Share class"),
      period_type: PeriodType,
      period_label: z.string().describe('Human label, e.g. "Jan 2025", "YTD 2025", "3Y ann."'),
      period_start: optionalDate("First day of the period"),
      period_end: optionalDate("Last day of the period"),
      return_pct: z.number().describe("Return in percent, e.g. 1.25 for +1.25%"),
      benchmark_name: optionalText("Benchmark name"),
      benchmark_return_pct: z.number().nullable().describe("Benchmark return in percent"),
      is_annualized: z.boolean().nullable(),
      net_or_gross: z.enum(["net", "gross", "unknown"]),
    }),
  ),
  metrics: z.array(
    z.object({
      fund_name: optionalText("Fund the metric belongs to"),
      name: z
        .string()
        .describe(
          "snake_case metric name, e.g. aum, nav, account_value, sharpe_ratio, volatility, " +
            "max_drawdown, management_fee, ongoing_charges, beta, number_of_holdings",
        ),
      value_number: z.number().nullable(),
      value_text: optionalText("Value, when it isn't a number"),
      unit: optionalText('Unit, e.g. "USD", "USD millions", "%", "x"'),
      as_of_date: optionalDate("Date the figure applies to"),
    }),
  ),
});

/** What the model returns. */
export type ModelExtraction = z.infer<typeof ExtractionSchema>;

/** Trimmed text, or null when the model left it empty. */
const text = (value: string): string | null => value.trim() || null;

/** Converts the model's output to the stored shape: "not stated" becomes null. */
export function toExtraction(raw: ModelExtraction) {
  return {
    ...raw,
    manager: text(raw.manager),
    as_of_date: text(raw.as_of_date),
    currency: text(raw.currency),
    funds: raw.funds.map((f) => ({
      ...f,
      share_class: text(f.share_class),
      isin: text(f.isin),
      ticker: text(f.ticker),
      strategy: text(f.strategy),
      asset_class: text(f.asset_class),
    })),
    performance: raw.performance.map((p) => ({
      ...p,
      share_class: text(p.share_class),
      period_start: text(p.period_start),
      period_end: text(p.period_end),
      benchmark_name: text(p.benchmark_name),
    })),
    metrics: raw.metrics.map((m) => ({
      ...m,
      fund_name: text(m.fund_name),
      value_text: text(m.value_text),
      unit: text(m.unit),
      as_of_date: text(m.as_of_date),
    })),
  };
}

/** An extraction ready to store, with missing values as null. */
export type Extraction = ReturnType<typeof toExtraction>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns the value if it is a real YYYY-MM-DD date, otherwise null. */
export function normalizeDate(value: string | null | undefined): string | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value) ? value : null;
}
