// Minimal dependency-free PDF writer: single page, Helvetica text and
// horizontal rules. Enough for a one-page invoice; text is encoded as
// WinAnsi (Latin-1) so Spanish accents render with the standard fonts.

export interface PdfTextLine {
  text: string;
  x: number;
  y: number;
  size?: number;
  bold?: boolean;
}

export interface PdfRule {
  x1: number;
  x2: number;
  y: number;
}

export interface SimplePdfDocument {
  lines: PdfTextLine[];
  rules?: PdfRule[];
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

// Characters outside Latin-1 cannot be represented with the standard fonts;
// replace them so the document never renders garbage.
function toLatin1Safe(text: string): string {
  return text.replace(/[^\x20-\xff]/g, "?");
}

function buildContentStream(doc: SimplePdfDocument): Buffer {
  const parts: string[] = [];
  for (const rule of doc.rules ?? []) {
    parts.push(
      `0.6 w ${rule.x1.toFixed(2)} ${rule.y.toFixed(2)} m ${rule.x2.toFixed(2)} ${rule.y.toFixed(2)} l S`,
    );
  }
  for (const line of doc.lines) {
    const font = line.bold ? "/F2" : "/F1";
    const size = line.size ?? 11;
    parts.push(
      `BT ${font} ${size} Tf ${line.x.toFixed(2)} ${line.y.toFixed(2)} Td (${escapePdfText(toLatin1Safe(line.text))}) Tj ET`,
    );
  }
  return Buffer.from(parts.join("\n"), "latin1");
}

export function renderSimplePdf(doc: SimplePdfDocument): Buffer {
  const content = buildContentStream(doc);

  const objects: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "latin1"),
    Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
      "latin1",
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`, "latin1"),
      content,
      Buffer.from("\nendstream", "latin1"),
    ]),
    Buffer.from(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "latin1",
    ),
    Buffer.from(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
      "latin1",
    ),
  ];

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%âãÏÓ\n", "latin1")];
  const offsets: number[] = [];
  let position = chunks[0]!.length;

  objects.forEach((body, index) => {
    offsets.push(position);
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, "latin1"),
      body,
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    chunks.push(chunk);
    position += chunk.length;
  });

  const xrefOffset = position;
  const xref = [
    `xref`,
    `0 ${objects.length + 1}`,
    `0000000000 65535 f `,
    ...offsets.map((o) => `${o.toString().padStart(10, "0")} 00000 n `),
    `trailer`,
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    `startxref`,
    `${xrefOffset}`,
    `%%EOF`,
    ``,
  ].join("\n");
  chunks.push(Buffer.from(xref, "latin1"));

  return Buffer.concat(chunks);
}

export const PDF_PAGE = { width: PAGE_WIDTH, height: PAGE_HEIGHT };
