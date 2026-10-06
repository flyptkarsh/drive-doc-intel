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

const isoDate = (what: string) => z.string().nullable().describe(`${what}, YYYY-MM-DD`);

/** The one schema every document is extracted into, whatever its layout. */
export const ExtractionSchema = z.object({
  document_type: DocumentType,
  title: z.string().describe("A short human title for the document"),
  manager: z.string().nullable().describe("Asset manager, issuer, or custodian that produced it"),
  as_of_date: isoDate("Reporting date"),
  currency: z.string().nullable().describe("Main reporting currency, ISO code"),
  summary: z.string().describe("2-4 sentence summary of what the document reports"),
  funds: z.array(
    z.object({
      fund_name: z.string(),
      share_class: z.string().nullable(),
      isin: z.string().nullable(),
      ticker: z.string().nullable(),
      strategy: z.string().nullable(),
      asset_class: z.string().nullable(),
    }),
  ),
  performance: z.array(
    z.object({
      fund_name: z.string(),
      share_class: z.string().nullable(),
      period_type: PeriodType,
      period_label: z.string().describe('Human label, e.g. "Jan 2025", "YTD 2025", "3Y ann."'),
      period_start: isoDate("First day of the period"),
      period_end: isoDate("Last day of the period"),
      return_pct: z.number().describe("Return in percent, e.g. 1.25 for +1.25%"),
      benchmark_name: z.string().nullable(),
      benchmark_return_pct: z.number().nullable(),
      is_annualized: z.boolean().nullable(),
      net_or_gross: z.enum(["net", "gross", "unknown"]),
    }),
  ),
  metrics: z.array(
    z.object({
      fund_name: z.string().nullable(),
      name: z
        .string()
        .describe(
          "snake_case metric name, e.g. aum, nav, account_value, sharpe_ratio, volatility, " +
            "max_drawdown, management_fee, ongoing_charges, beta, number_of_holdings",
        ),
      value_number: z.number().nullable(),
      value_text: z.string().nullable(),
      unit: z.string().nullable().describe('e.g. "USD", "USD millions", "%", "x"'),
      as_of_date: isoDate("Date the figure applies to"),
    }),
  ),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns the value if it is a real YYYY-MM-DD date, otherwise null. */
export function normalizeDate(value: string | null | undefined): string | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value) ? value : null;
}
