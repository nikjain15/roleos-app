/**
 * Revise-by-instruction enforcement (docs/specs/resume-editor-v2.md §"Tell me to
 * adjust"). PURE guarantees applied to the model's proposed rewrite — we never
 * trust the model to honor scope or locks; we enforce them here.
 *
 * Invariants (spec §"Guardrails"):
 *  - SCOPED: a section tune only touches that section; every other section is kept
 *    verbatim.
 *  - LOCK-AWARE: a ✓-approved (locked) line is never rewritten — its text is
 *    restored even if the model changed or dropped it.
 *  - HEADERS ARE TRUTH: a revise never renames the employer/title/dates — the
 *    section header always comes from the current doc, only the lines can change.
 *
 * The truth-gate (in runSkill) is the other half — it caps content to the master
 * profile. This module caps STRUCTURE. Unit-tested without a model.
 */

import type { ResumeExperience, ResumeLine } from "./doc";

/** RO's structured change-log entry ("what I tuned"). */
export interface ReviseChange {
  type: "reframed" | "moved" | "dropped" | "added" | "kept";
  target: string; // which line/section, human-readable
  why: string; // tied to a role requirement
}

/**
 * Merge the model's `revised` sections onto `current`, enforcing scope + locks.
 * `sectionId` (optional) limits the change to one section; omit for a whole-résumé
 * revise. Returns the new experience array.
 */
export function applyRevision(
  current: ResumeExperience[],
  revised: ResumeExperience[],
  opts: { sectionId?: string } = {},
): ResumeExperience[] {
  const revById = new Map(revised.map((s) => [s.id, s]));

  return current.map((cur, idx) => {
    const inScope = !opts.sectionId || cur.id === opts.sectionId;
    if (!inScope) return cur; // out of scope → untouched

    const rev = revById.get(cur.id) ?? revised[idx];
    if (!rev) return cur; // model dropped the whole section → keep current

    const lockedCur = cur.lines.filter((l) => l.locked);
    const lockedById = new Map(lockedCur.map((l) => [l.id, l]));

    // Start from the revised lines, but restore any locked line's original text.
    const lines: ResumeLine[] = rev.lines.map((l) => {
      const lk = lockedById.get(l.id);
      return lk ? { ...lk } : l;
    });

    // Re-insert any locked line the model dropped, at its original position.
    for (const lk of lockedCur) {
      if (!lines.some((l) => l.id === lk.id)) {
        const origIdx = cur.lines.findIndex((l) => l.id === lk.id);
        lines.splice(Math.min(Math.max(origIdx, 0), lines.length), 0, { ...lk });
      }
    }

    // Header (company/title/dates) is truth — always the current one.
    return { ...cur, lines };
  });
}

/** Coerce arbitrary model JSON → a clean change-log (tolerant, capped). */
export function parseChanges(raw: unknown): ReviseChange[] {
  const TYPES = new Set(["reframed", "moved", "dropped", "added", "kept"]);
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((c): ReviseChange[] => {
      if (!c || typeof c !== "object") return [];
      const o = c as Record<string, unknown>;
      const type = typeof o.type === "string" && TYPES.has(o.type) ? (o.type as ReviseChange["type"]) : "reframed";
      const target = typeof o.target === "string" ? o.target.slice(0, 200) : "";
      const why = typeof o.why === "string" ? o.why.slice(0, 300) : "";
      if (!target && !why) return [];
      return [{ type, target, why }];
    })
    .slice(0, 20);
}
