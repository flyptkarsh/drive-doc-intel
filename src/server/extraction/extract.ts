import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { anthropic, REFUSAL_FALLBACK } from "../claude";
import { env } from "../env";
import type { PreparedContent } from "./content";
import { ExtractionSchema, toExtraction, type Extraction } from "./schema";

const MAX_KNOWN_FUNDS = 300;

const SYSTEM_PROMPT = `You extract structured data from financial documents: fund factsheets, account statements, performance reports, investor letters and manager emails. Every manager uses a different layout and vocabulary, so read the whole document and map what it says onto the schema.

Performance:
- Emit one row per fund, share class and period. Monthly return grids (a year-by-month table) become one "month" row per cell, with period_start and period_end set to the first and last day of that month.
- Trailing periods (1Y, 3Y, since inception) and calendar-year returns get their own rows. Mark is_annualized when the document says so or the convention is clear (multi-year trailing returns usually are).
- return_pct is in percent: "+1.2%" becomes 1.2, "(0.8%)" or "-0.8%" becomes -0.8. Never convert to decimals.
- Attach the benchmark return for the same period when the document shows one.
- Resolve period end dates from the document's reporting date when a table only says "1 month", "YTD" and so on.

Metrics: capture headline figures such as AUM, NAV per share, account value, fees, risk statistics, holdings count. Use consistent snake_case names. Store numbers in value_number with the unit, and text-only values in value_text.

Funds: list each fund or account the document covers. If a fund matches one in the known-funds list, use that exact fund_name so data lines up across documents.

Only report what the document states. Leave text fields as an empty string and number fields as null when the document doesn't say; leave arrays empty when a document has no such data. Dates are YYYY-MM-DD.`;

export class ExtractionError extends Error {
  override name = "ExtractionError";
}

/** Extracts structured data from one prepared document with Claude structured outputs. */
export async function extractDocument(
  fileName: string,
  content: PreparedContent,
  knownFunds: string[],
): Promise<Extraction> {
  const known = knownFunds.length
    ? knownFunds
        .slice(0, MAX_KNOWN_FUNDS)
        .map((f) => `- ${f}`)
        .join("\n")
    : "(none yet)";

  // Streamed because a dense factsheet can produce a long response; the SDK
  // refuses non-streaming requests with a max_tokens this large.
  const stream = anthropic().beta.messages.stream({
    model: env.model,
    max_tokens: 64000,
    ...REFUSAL_FALLBACK,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: betaZodOutputFormat(ExtractionSchema) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          ...content.blocks,
          {
            type: "text",
            text:
              `File name: ${fileName}\n\nKnown funds from other documents:\n${known}\n\n` +
              "Extract the structured data from this document.",
          },
        ],
      },
    ],
  });
  const response = await stream.finalMessage();

  switch (response.stop_reason) {
    case "refusal":
      throw new ExtractionError("The model declined to process this document.");
    case "max_tokens":
      throw new ExtractionError("The document produced more data than fits in one response.");
  }
  if (!response.parsed_output) {
    throw new ExtractionError("The model's response did not match the extraction schema.");
  }
  return toExtraction(response.parsed_output);
}
