import { Document, Paragraph, TextRun } from "docx";

/**
 * Build an ATS-safe DOCX for a cover letter (J10.2 export) — the standard
 * business-letter layout recruiters and parsers expect: sender name, date,
 * greeting, short body paragraphs, sign-off. Same rules as the résumé export:
 * one clean single column, no tables/text boxes/images, selectable text,
 * Calibri 11pt. Pure paragraph-plan + Document builder so it unit-tests without
 * packing; the route does the Workers-safe `Packer.toBase64String`.
 */
export interface CoverDocxContent {
  /** Sender name for the letterhead line (optional — omitted when unknown). */
  name?: string;
  /** e.g. "Founding Senior Product Manager — Retell AI" (context line under the name). */
  roleLabel?: string;
  /** Pre-formatted date line, e.g. "July 29, 2026". Caller formats (route has the clock). */
  dateLine?: string;
  greeting?: string;
  /** Body paragraphs, in order (already truth-gated content). */
  paragraphs: string[];
  signoff?: string;
}

/** The paragraph plan — exported so tests assert structure without packing. */
export function coverParagraphs(content: CoverDocxContent): Paragraph[] {
  const paras: Paragraph[] = [];
  const spacing = { after: 200 };

  if (content.name?.trim()) {
    paras.push(new Paragraph({ children: [new TextRun({ text: content.name.trim(), bold: true, size: 26 })] }));
  }
  if (content.roleLabel?.trim()) {
    paras.push(new Paragraph({ spacing, children: [new TextRun({ text: content.roleLabel.trim(), size: 20 })] }));
  }
  if (content.dateLine?.trim()) {
    paras.push(new Paragraph({ spacing, children: [new TextRun({ text: content.dateLine.trim(), size: 22 })] }));
  }
  if (content.greeting?.trim()) {
    paras.push(new Paragraph({ spacing, children: [new TextRun({ text: content.greeting.trim(), size: 22 })] }));
  }
  for (const p of content.paragraphs) {
    if (!p.trim()) continue;
    paras.push(new Paragraph({ spacing, children: [new TextRun({ text: p.trim(), size: 22 })] }));
  }
  if (content.signoff?.trim()) {
    // A sign-off can be multi-line ("Best,\nName") — keep each line its own run-break.
    const lines = content.signoff.trim().split(/\n/);
    paras.push(
      new Paragraph({
        children: lines.flatMap((l, i) =>
          i === 0 ? [new TextRun({ text: l, size: 22 })] : [new TextRun({ text: l, size: 22, break: 1 })],
        ),
      }),
    );
  }

  if (paras.length === 0) paras.push(new Paragraph({ children: [new TextRun("")] }));
  return paras;
}

export function buildCoverDocx(content: CoverDocxContent): Document {
  return new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } }, // 11pt, ATS-safe default
      },
    },
    sections: [{ children: coverParagraphs(content) }],
  });
}
