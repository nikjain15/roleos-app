/**
 * Sectioned cover-letter doc model (J10.2). A letter is four sections with JOBS —
 * opening (the hook) · why_them (the homework) · why_you (the proof) · closing
 * (the ask) — each carrying RO's rationale and a keep-lock, mirroring the résumé
 * doc model so the editor grammar (✓-keep, "Why RO wrote this", scoped tune) is
 * the same across Studio.
 *
 * Backward/forward compatible BOTH ways:
 *  - `parseCoverDoc` reads new `sections[]` AND legacy flat `body` (→ one
 *    editable "letter" section; the user re-drafts to get real sections).
 *  - `compileBody` joins sections back into the flat `body` string, which is
 *    ALWAYS kept on the artifact content — the apply bundle, tracker, and Gmail
 *    compose never need to know about sections.
 *
 * PURE — unit-tested without a model or the DOM.
 */

export const COVER_SECTION_IDS = ["opening", "why_them", "why_you", "closing"] as const;
export type CoverSectionId = (typeof COVER_SECTION_IDS)[number] | "letter";

export const COVER_SECTION_LABELS: Record<string, string> = {
  opening: "Opening — the hook",
  why_them: "Why them — you've done the homework",
  why_you: "Why you — the proof",
  closing: "Closing — the ask",
  letter: "Your letter",
};

/** One-tap tune presets per section job (the freeform input covers the rest). */
export const COVER_TUNE_PRESETS: Record<string, string[]> = {
  opening: ["More direct", "Warmer", "Lead with a metric", "Shorter"],
  why_them: ["More specific to them", "Less flattery", "Tie to their stage", "Shorter"],
  why_you: ["Strongest metric first", "One story, deeper", "More senior framing", "Shorter"],
  closing: ["Confident ask", "Low-key", "Name a next step", "Shorter"],
  letter: ["More direct", "Warmer", "Shorter", "More specific"],
};

export interface CoverSection {
  id: string;
  /** Display label; derived from id when absent. */
  label: string;
  text: string;
  /** Why RO wrote it this way (shown behind "Why RO wrote this ✎"). */
  rationale: string;
  /** ✓-keep: a locked section is never rewritten by a tune. */
  locked: boolean;
}

export interface CoverDoc {
  subject: string;
  greeting: string;
  signoff: string;
  sections: CoverSection[];
  angle: string | null;
  truthNote: string | null;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function toSection(raw: unknown, fallbackId: string): CoverSection | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = str(o.id) || fallbackId;
  const text = str(o.text).trim();
  if (!text) return null;
  return {
    id,
    label: str(o.label) || COVER_SECTION_LABELS[id] || id,
    text,
    rationale: str(o.rationale),
    locked: o.locked === true,
  };
}

/**
 * Parse artifact content into the sectioned doc. New shape: `sections[]` (+
 * greeting/signoff). Legacy shape: flat `body` → one "letter" section holding the
 * body between greeting and sign-off lines when they're detectable, else verbatim.
 */
export function parseCoverDoc(content: unknown): CoverDoc {
  const c = (content && typeof content === "object" ? content : {}) as Record<string, unknown>;
  const base = {
    subject: str(c.subject),
    angle: str(c.angle) || null,
    truthNote: str(c.truth_note) || null,
  };

  if (Array.isArray(c.sections)) {
    const sections = c.sections
      .map((s, i) => toSection(s, COVER_SECTION_IDS[i] ?? `section_${i}`))
      .filter((s): s is CoverSection => s !== null);
    if (sections.length > 0) {
      return { ...base, greeting: str(c.greeting), signoff: str(c.signoff), sections };
    }
  }

  // Legacy flat body → one editable section (re-draft to get real sections).
  const body = str(c.body).trim();
  return {
    ...base,
    greeting: "",
    signoff: "",
    sections: body ? [{ id: "letter", label: COVER_SECTION_LABELS.letter, text: body, rationale: "", locked: false }] : [],
  };
}

/** Compile sections back to the flat letter body (greeting + paragraphs + signoff). */
export function compileBody(doc: CoverDoc): string {
  const parts = [
    doc.greeting.trim(),
    ...doc.sections.map((s) => s.text.trim()),
    doc.signoff.trim(),
  ].filter((p) => p.length > 0);
  return parts.join("\n\n");
}

/** Serialize the doc to artifact content — sections AND the compiled flat body. */
export function toContent(doc: CoverDoc): Record<string, unknown> {
  return {
    subject: doc.subject,
    greeting: doc.greeting,
    signoff: doc.signoff,
    sections: doc.sections.map((s) => ({
      id: s.id,
      label: s.label,
      text: s.text,
      rationale: s.rationale,
      locked: s.locked,
    })),
    body: compileBody(doc),
    angle: doc.angle ?? "",
    truth_note: doc.truthNote ?? "",
  };
}
