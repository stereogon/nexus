/**
 * Writes a small, valid PDF from lines of text.
 *
 * Generated rather than checked in. A binary fixture is a file nobody can review in a
 * diff, and what the tests need from it — which words are where, on which page — is
 * clearer stated in `fixture.ts` than discovered by opening a PDF. ASCII only, so a
 * string's length is its byte length and the cross-reference offsets are exact.
 *
 * Helvetica is one of the fourteen standard fonts, which a PDF may use without embedding;
 * pdf.js draws it from the standard font data the app already bundles.
 */
import { PAGE, type Line } from "./fixture";

/** Escapes the three characters a PDF string literal treats specially. */
function literal(text: string): string {
  return text.replace(/[\\()]/g, (character) => `\\${character}`);
}

function contents(lines: readonly Line[]): string {
  return lines
    .map(
      (line) =>
        `BT /F1 ${String(line.size)} Tf ${String(line.x)} ${String(line.y)} Td ` +
        `(${literal(line.text)}) Tj ET`,
    )
    .join("\n");
}

export function pdfOf(pages: readonly (readonly Line[])[]): string {
  // Object numbers: 1 catalog, 2 page tree, 3 font, then a page and its content stream
  // for each page, in that order.
  const objects: string[] = [];
  const pageNumbers = pages.map((_, index) => 4 + index * 2);

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${String(n)} 0 R`).join(" ")}] ` +
      `/Count ${String(pages.length)} >>`,
  );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

  for (const [index, lines] of pages.entries()) {
    const stream = contents(lines);
    const content = 5 + index * 2;

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${String(PAGE.width)} ${String(PAGE.height)}] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${String(content)} 0 R >>`,
    );
    objects.push(`<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream`);
  }

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];

  for (const [index, object] of objects.entries()) {
    offsets.push(body.length);
    body += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  }

  const xref = body.length;
  const entries = offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`);

  return (
    body +
    `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${entries.join("")}` +
    `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\n` +
    `startxref\n${String(xref)}\n%%EOF\n`
  );
}
