import { describe, expect, it } from "vitest";
import { htmlToText, prepareContent } from "./content";

describe("htmlToText", () => {
  it("keeps table rows as pipe-separated cells and drops scripts and styles", () => {
    const text = htmlToText(`
      <html><head><style>p{color:red}</style></head><body>
        <h1>Fund update</h1><p>Returned <b>+3.4%</b> in January.</p>
        <script>track()</script>
        <table><tr><th>Period</th><th>Fund</th></tr><tr><td>1 Month</td><td>3.4%</td></tr></table>
      </body></html>`);
    expect(text.split("\n")).toEqual([
      "Fund update",
      "Returned +3.4% in January.",
      "| Period | Fund |",
      "| 1 Month | 3.4% |",
    ]);
  });
});

describe("prepareContent", () => {
  it("sends CSV as a labelled text block", async () => {
    const csv = "Year,Month,Return\n2026,Jan,1.12\n";
    const { blocks, text } = await prepareContent("returns.csv", "text/csv", Buffer.from(csv));
    expect(text).toBe(csv);
    expect(blocks).toEqual([{ type: "text", text: `<csv>\n${csv}\n</csv>` }]);
  });

  it("parses an email with its headers and HTML body", async () => {
    const eml = [
      "From: IR <ir@manager.example>",
      "Subject: January update",
      "Date: Mon, 2 Feb 2026 09:00:00 +0000",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>The fund returned <b>1.5%</b>.</p>",
    ].join("\r\n");
    const { text } = await prepareContent("update.eml", "message/rfc822", Buffer.from(eml));
    expect(text).toContain("Subject: January update");
    expect(text).toContain("The fund returned 1.5%.");
  });

  it("detects HTML by extension when Drive reports a generic MIME type", async () => {
    const { blocks } = await prepareContent(
      "factsheet.htm",
      "application/octet-stream",
      Buffer.from("<p>NAV 132.48</p>"),
    );
    expect(blocks[0]).toMatchObject({ type: "text", text: expect.stringContaining("NAV 132.48") });
  });
});
