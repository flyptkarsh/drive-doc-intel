import "server-only";
import { HTMLElement, Node, NodeType, parse } from "node-html-parser";
import PostalMime from "postal-mime";
import { extractText, getDocumentProxy } from "unpdf";
import type Anthropic from "@anthropic-ai/sdk";
import { ExtractionError } from "./errors";

type Block = Anthropic.Beta.Messages.BetaContentBlockParam;

/** What we send to Claude for one file, plus plain text kept for search. */
export type PreparedContent = {
  blocks: Block[];
  text: string;
};

// The Messages API accepts requests up to 32 MB and PDFs up to 600 pages. PDF
// bytes grow by a third as base64, so all PDFs in one request share a 20 MB
// budget; anything over the budget or the page limit is sent as its text layer.
const MAX_PDF_BYTES_PER_REQUEST = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 600;
const MAX_TEXT_CHARS = 600_000;

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "br",
  "li",
  "ul",
  "ol",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "section",
  "article",
  "header",
  "footer",
  "tr",
  "table",
  "blockquote",
  "pre",
]);

/** Flattens HTML to text, keeping table rows as pipe-separated cells. */
export function htmlToText(html: string): string {
  const root = parse(html, { blockTextElements: { script: false, style: false } });
  const lines: string[] = [];
  let line = "";
  const flush = () => {
    const t = line.replace(/[ \t ]+/g, " ").trim();
    if (t) lines.push(t);
    line = "";
  };
  const walk = (node: Node) => {
    if (node.nodeType === NodeType.TEXT_NODE) {
      line += node.text;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.rawTagName?.toLowerCase() ?? "";
    if (tag === "script" || tag === "style" || tag === "head") return;
    if (tag === "tr") {
      flush();
      const cells = node.querySelectorAll("td, th").map((c) => c.text.replace(/\s+/g, " ").trim());
      lines.push("| " + cells.join(" | ") + " |");
      return;
    }
    if (BLOCK_TAGS.has(tag)) flush();
    node.childNodes.forEach(walk);
    if (BLOCK_TAGS.has(tag)) flush();
  };
  walk(root);
  flush();
  return lines.join("\n");
}

/** Text layer and page count of a PDF; empty text if it can't be parsed. */
async function readPdf(bytes: Buffer): Promise<{ text: string; pages: number | null }> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return { text, pages: pdf.numPages };
  } catch (err) {
    console.warn("Could not read PDF text layer:", (err as Error).message);
    return { text: "", pages: null };
  }
}

function textBlock(label: string, text: string): Block {
  let body = text;
  if (body.length > MAX_TEXT_CHARS) {
    body =
      body.slice(0, MAX_TEXT_CHARS) +
      `\n\n[Content truncated: the original is ${text.length.toLocaleString()} characters.]`;
  }
  return { type: "text", text: `<${label}>\n${body}\n</${label}>` };
}

/** Remaining PDF bytes that can still go into the current request. */
type PdfBudget = { bytes: number };

async function pdfBlocks(
  bytes: Buffer,
  title: string,
  budget: PdfBudget,
): Promise<PreparedContent> {
  const { text, pages } = await readPdf(bytes);
  const fitsAsPdf = bytes.length <= budget.bytes && (pages ?? 0) <= MAX_PDF_PAGES;
  if (fitsAsPdf) {
    budget.bytes -= bytes.length;
    const data = bytes.toString("base64");
    return {
      blocks: [
        {
          type: "document",
          title,
          source: { type: "base64", media_type: "application/pdf", data },
        },
      ],
      text,
    };
  }
  // Too large or too long to send as a PDF: fall back to its text layer.
  if (!text.trim()) {
    throw new ExtractionError(
      `"${title}" is too large to send as a PDF and has no readable text (it may be a scan).`,
    );
  }
  return { blocks: [textBlock("pdf_text", text)], text };
}

type Kind = "pdf" | "email" | "html" | "csv" | "text";

const KIND_BY_MIME: Record<string, Kind> = {
  "application/pdf": "pdf",
  "message/rfc822": "email",
  "text/html": "html",
  "text/csv": "csv",
  "text/plain": "text",
};

const KIND_BY_EXTENSION: [RegExp, Kind][] = [
  [/\.pdf$/i, "pdf"],
  [/\.eml$/i, "email"],
  [/\.html?$/i, "html"],
  [/\.csv$/i, "csv"],
];

/** The file's type decides; the name is only used when Drive reports a generic type. */
export function detectKind(name: string, mimeType: string): Kind {
  return (
    KIND_BY_MIME[mimeType] ??
    KIND_BY_EXTENSION.find(([pattern]) => pattern.test(name))?.[1] ??
    "text"
  );
}

export async function prepareContent(
  name: string,
  mimeType: string,
  bytes: Buffer,
): Promise<PreparedContent> {
  const budget: PdfBudget = { bytes: MAX_PDF_BYTES_PER_REQUEST };

  switch (detectKind(name, mimeType)) {
    case "pdf":
      return pdfBlocks(bytes, name, budget);

    case "email": {
      const email = await PostalMime.parse(bytes);
      const body = email.html ? htmlToText(email.html) : (email.text ?? "");
      const header = [
        `Subject: ${email.subject ?? ""}`,
        `From: ${email.from?.address ?? ""} ${email.from?.name ?? ""}`.trim(),
        `Date: ${email.date ?? ""}`,
      ].join("\n");
      const blocks: Block[] = [textBlock("email", `${header}\n\n${body}`)];
      let text = `${header}\n\n${body}`;
      // Fund managers often attach the actual factsheet to the email.
      for (const att of email.attachments ?? []) {
        if (att.mimeType === "application/pdf" && att.content) {
          const pdf = await pdfBlocks(
            Buffer.from(att.content as ArrayBuffer),
            att.filename ?? "attachment.pdf",
            budget,
          );
          blocks.push(...pdf.blocks);
          text += `\n\n${pdf.text}`;
        }
      }
      return { blocks, text };
    }

    case "html": {
      const text = htmlToText(bytes.toString("utf8"));
      return { blocks: [textBlock("html_document_text", text)], text };
    }

    case "csv": {
      const raw = bytes.toString("utf8");
      return { blocks: [textBlock("csv", raw)], text: raw };
    }

    case "text": {
      const raw = bytes.toString("utf8");
      return { blocks: [textBlock("document", raw)], text: raw };
    }
  }
}
