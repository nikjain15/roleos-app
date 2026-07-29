/**
 * Cover-letter tune enforcement (J10.2 §per-section personalization). PURE
 * guarantees applied to the model's proposed rewrite — we never trust the model
 * to honor scope or locks; we enforce them here (mirrors lib/resume/revise.ts).
 *
 * Invariants:
 *  - SCOPED: a section tune only touches THAT section — every other section,
 *    the greeting, sign-off, and subject are kept verbatim.
 *  - LOCK-AWARE: a ✓-kept (locked) section is never rewritten, even if it was
 *    the requested target — the tune is refused (the UI disables this anyway;
 *    the enforcement is the guarantee).
 *  - STRUCTURE IS TRUTH: a tune never adds, drops, or reorders sections.
 *
 * The truth gate (in runSkill) caps CONTENT to the master profile; this module
 * caps STRUCTURE. Unit-tested without a model.
 */

import type { CoverDoc } from "./doc";

export interface CoverTuneResult {
  doc: CoverDoc;
  /** Whether anything actually changed (false when target was locked/missing). */
  applied: boolean;
  /** RO's one-line note on what it changed, for the change-log. */
  note: string;
}

/**
 * Apply the model's revised text for ONE section onto the doc, enforcing scope +
 * locks. `revisedText` is the model's rewrite of the target section only.
 */
export function applyCoverTune(
  doc: CoverDoc,
  sectionId: string,
  revisedText: string,
  opts: { note?: string; rationale?: string } = {},
): CoverTuneResult {
  const target = doc.sections.find((s) => s.id === sectionId);
  const text = revisedText.trim();
  if (!target || !text) {
    return { doc, applied: false, note: "Nothing tuned — the section wasn't found or the rewrite was empty." };
  }
  if (target.locked) {
    return { doc, applied: false, note: `"${target.label}" is ✓-kept — unlock it to tune it.` };
  }
  if (text === target.text.trim()) {
    return { doc, applied: false, note: "The rewrite came back unchanged." };
  }
  const sections = doc.sections.map((s) =>
    s.id === sectionId ? { ...s, text, rationale: opts.rationale?.trim() || s.rationale } : s,
  );
  return {
    doc: { ...doc, sections },
    applied: true,
    note: opts.note?.trim() || `Tuned "${target.label}".`,
  };
}
