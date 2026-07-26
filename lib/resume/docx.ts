import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import type { ResumeBullet } from "./flags";

/**
 * Build an ATS-safe DOCX for a tailored résumé (résumé-editor v2, export).
 *
 * One clean single-column layout (no tables, text boxes, or images — ATS parsers
 * choke on those). Real headings + bullet paragraphs so the text stays selectable
 * (not an image). Structured as EXPERIENCE sections (Company · Title · Dates →
 * bullets), the layout recruiters + parsers expect. Packing to bytes is the
 * caller's job (route), because the Workers-safe path (`Packer.toBase64String`)
 * differs from Node — this module stays pure so it unit-tests without a runtime.
 *
 * Backward-compatible: a legacy flat `bullets[]` (no `experience`) still renders
 * under one "Experience" heading.
 */
export interface ResumeDocExperience {
  company?: string;
  title?: string;
  dates?: string;
  lines: { text: string }[];
}

export interface ResumeDocContent {
  name?: string;
  headline?: string; // e.g. "Tailored for Acme — Staff PM"
  summary?: string;
  experience?: ResumeDocExperience[];
  bullets?: ResumeBullet[]; // legacy flat fallback
  keywords_injected?: string[];
}

/** "Company — Title  ·  Dates" as one bold header paragraph (ATS-safe: plain text). */
function experienceHeader(exp: ResumeDocExperience): Paragraph {
  const runs: TextRun[] = [];
  const heading = [exp.company, exp.title].filter((s) => s?.trim()).join(" — ");
  if (heading) runs.push(new TextRun({ text: heading, bold: true, size: 22 }));
  if (exp.dates?.trim()) runs.push(new TextRun({ text: `  ·  ${exp.dates.trim()}`, italics: true, size: 20 }));
  if (runs.length === 0) runs.push(new TextRun({ text: "Experience", bold: true, size: 22 }));
  return new Paragraph({ spacing: { before: 120 }, children: runs });
}

/** The section/paragraph plan — exported so tests can assert structure w/o packing. */
export function resumeParagraphs(content: ResumeDocContent): Paragraph[] {
  const paras: Paragraph[] = [];

  if (content.name) {
    paras.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: content.name, bold: true, size: 32 })],
      }),
    );
  }
  if (content.headline) {
    paras.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: content.headline, italics: true, size: 22 })],
      }),
    );
  }

  if (content.summary) {
    paras.push(new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Summary" }));
    paras.push(new Paragraph({ children: [new TextRun(content.summary)] }));
  }

  const experience = (content.experience ?? []).filter((e) => e.lines.some((l) => l.text?.trim()));
  if (experience.length) {
    paras.push(new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Experience" }));
    for (const exp of experience) {
      paras.push(experienceHeader(exp));
      for (const line of exp.lines) {
        if (line.text?.trim()) paras.push(new Paragraph({ text: line.text, bullet: { level: 0 } }));
      }
    }
  } else {
    // Legacy flat fallback: bullets with no section structure.
    const bullets = (content.bullets ?? []).filter((b) => b?.text?.trim());
    if (bullets.length) {
      paras.push(new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Experience" }));
      for (const b of bullets) {
        paras.push(new Paragraph({ text: b.text, bullet: { level: 0 } }));
      }
    }
  }

  const kws = (content.keywords_injected ?? []).filter(Boolean);
  if (kws.length) {
    paras.push(new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Skills & Keywords" }));
    paras.push(new Paragraph({ children: [new TextRun(kws.join(" · "))] }));
  }

  // Never emit a body-less document — a caller should gate on hasBody, but guard anyway.
  if (paras.length === 0) {
    paras.push(new Paragraph({ children: [new TextRun("")] }));
  }
  return paras;
}

export function buildResumeDoc(content: ResumeDocContent): Document {
  return new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } }, // 11pt, an ATS-safe default
      },
    },
    sections: [{ children: resumeParagraphs(content) }],
  });
}
