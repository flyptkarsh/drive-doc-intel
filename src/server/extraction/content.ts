import "server-only";
import { HTMLElement, Node, NodeType, parse } from "node-html-parser";
import PostalMime from "postal-mime";
import { extractText, getDocumentProxy } from "unpdf";
import type Anthropic from "@anthropic-ai/sdk";

type Block = Anthropic.Beta.Messages.BetaContentBlockParam;

/** What we send to Claude for one file, plus plain text kept for search. */
export type PreparedContent = {
  blocks: Block[];
  text: string;
};

// The Messages API accepts requests up to 32 MB; leave headroom for base64.
const MAX_PDF_BYTES = 20 * 1024 * 1024;
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

async function pdfText(bytes: Buffer): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch {
    return "";
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

async function pdfBlocks(bytes: Buffer, title: string): Promise<PreparedContent> {
  const text = await pdfText(bytes);
  if (bytes.length <= MAX_PDF_BYTES) {
    return {
      blocks: [
        {
          type: "document",
          title,
          source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") },
        },
      ],
      text,
    };
  }
  // Too large to send as a PDF: fall back to its text layer.
  return { blocks: [textBlock("pdf_text", text)], text };
}

export async function prepareContent(
  name: string,
  mimeType: string,
  bytes: Buffer,
): Promise<PreparedContent> {
  const lower = name.toLowerCase();

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    return pdfBlocks(bytes, name);
  }

  if (mimeType === "message/rfc822" || lower.endsWith(".eml")) {
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
        const buf = Buffer.from(att.content as ArrayBuffer);
        const pdf = await pdfBlocks(buf, att.filename ?? "attachment.pdf");
        blocks.push(...pdf.blocks);
        text += `\n\n${pdf.text}`;
      }
    }
    return { blocks, text };
  }

  const raw = bytes.toString("utf8");
  if (mimeType === "text/html" || /\.html?$/.test(lower)) {
    const text = htmlToText(raw);
    return { blocks: [textBlock("html_document_text", text)], text };
  }
  if (mimeType === "text/csv" || lower.endsWith(".csv")) {
    return { blocks: [textBlock("csv", raw)], text: raw };
  }
  return { blocks: [textBlock("document", raw)], text: raw };
}
