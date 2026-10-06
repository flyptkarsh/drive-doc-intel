import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { anthropic, FALLBACK } from "./claude";
import { env } from "./env";
import type { PreparedContent } from "./content";

const PeriodType = z.enum([
  "month", "quarter", "ytd", "1y", "3y", "5y", "10y",
  "since_inception", "calendar_year", "other",
]);

export const ExtractionSchema = z.object({
  document_type: z.enum([
    "fund_factsheet", "account_statement", "performance_report",
    "investor_letter", "transaction_confirmation", "market_commentary", "other",
  ]),
  title: z.string().describe("A short human title for the document"),
  manager: z.string().nullable().describe("Asset manager, issuer, or custodian that produced it"),
  as_of_date: z.string().nullable().describe("Reporting date, YYYY-MM-DD"),
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
      period_start: z.string().nullable().describe("YYYY-MM-DD"),
      period_end: z.string().nullable().describe("YYYY-MM-DD"),
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
      name: z.string().describe(
        "snake_case metric name, e.g. aum, nav, account_value, sharpe_ratio, volatility, max_drawdown, management_fee, ongoing_charges, beta, number_of_holdings",
      ),
      value_number: z.number().nullable(),
      value_text: z.string().nullable(),
      unit: z.string().nullable().describe('e.g. "USD", "USD millions", "%", "x"'),
      as_of_date: z.string().nullable().describe("YYYY-MM-DD"),
    }),
  ),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

const SYSTEM = `You extract structured data from financial documents: fund factsheets, account statements, performance reports, investor letters and manager emails. Every manager uses a different layout and vocabulary, so read the whole document and map what it says onto the schema.

Performance:
- Emit one row per fund, share class and period. Monthly return grids (a year-by-month table) become one "month" row per cell, with period_start and period_end set to the first and last day of that month.
- Trailing periods (1Y, 3Y, since inception) and calendar-year returns get their own rows. Mark is_annualized when the document says so or the convention is clear (multi-year trailing returns usually are).
- return_pct is in percent: "+1.2%" becomes 1.2, "(0.8%)" or "-0.8%" becomes -0.8. Never convert to decimals.
- Attach the benchmark return for the same period when the document shows one.
- Resolve period end dates from the document's reporting date when a table only says "1 month", "YTD" and so on.

Metrics: capture headline figures such as AUM, NAV per share, account value, fees, risk statistics, holdings count. Use consistent snake_case names. Store numbers in value_number with the unit, and text-only values in value_text.

Funds: list each fund or account the document covers. If a fund matches one in the known-funds list, use that exact fund_name so data lines up across documents.

Only report what the document states. Use null for anything missing; leave arrays empty when a document has no such data. Dates are YYYY-MM-DD.`;

export async function extractDocument(
  fileName: string,
  content: PreparedContent,
  knownFunds: string[],
): Promise<Extraction> {
  const known = knownFunds.length
    ? knownFunds.slice(0, 300).map((f) => `- ${f}`).join("\n")
    : "(none yet)";

  // Streamed because a dense factsheet can produce a long response; the SDK
  // refuses non-streaming requests with a max_tokens this large.
  const stream = anthropic().beta.messages.stream({
    model: env.model,
    max_tokens: 64000,
    ...FALLBACK,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: betaZodOutputFormat(ExtractionSchema),
    },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          ...content.blocks,
          {
            type: "text",
            text: `File name: ${fileName}\n\nKnown funds from other documents:\n${known}\n\nExtract the structured data from this document.`,
          },
        ],
      },
    ],
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to process this document.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The document produced more data than fits in one response.");
  }
  if (!response.parsed_output) {
    throw new Error("The model's response did not match the extraction schema.");
  }
  return response.parsed_output;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns the date if it's a valid YYYY-MM-DD string, otherwise null. */
export function isoDate(value: string | null | undefined): string | null {
  if (!value || !ISO_DATE.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}
