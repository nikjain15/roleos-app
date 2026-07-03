/**
 * Résumé truth-flag mapping (Slice 1, Résumé Editor).
 *
 * The truth gate (`agent/quality-gate.ts`) emits `provenance.truth.violations` as
 * freeform plain-language strings — NOT tied to a specific bullet. The editor needs
 * per-line flag chips, so we map each violation to the bullet it most likely refers
 * to (token overlap), leaving unmatched violations as document-level flags.
 *
 * This is a render-time heuristic, deliberately invariant-safe: it does NOT touch the
 * drafter's model contract or the truth gate. (Future eng-debt: have `draft_resume`
 * emit a stable per-bullet flag id so the mapping is exact rather than inferred.)
 *
 * Pure + dependency-free so it's unit-tested and reused by the editor and the
 * live-status recompute.
 */

export interface ResumeBullet {
  text: string;
  rationale?: string;
  evidence?: string;
}

export interface BulletFlag {
  /** index into the bullets array */
  bulletIndex: number;
  /** the violation strings mapped to this bullet */
  reasons: string[];
}

export interface FlagMapping {
  /** per-bullet flags, only for bullets that have ≥1 unresolved violation */
  byBullet: BulletFlag[];
  /** violations that couldn't be tied to a bullet → shown at document level */
  documentLevel: string[];
  /** true when nothing remains flagged (→ résumé is "grounded", export enables) */
  grounded: boolean;
  /** count of unresolved violations still outstanding */
  outstanding: number;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "with", "by", "at",
  "as", "is", "was", "that", "this", "it", "its", "from", "into", "over",
  "claim", "claims", "line", "bullet", "résumé", "resume", "draft", "states", "state",
  "says", "overstate", "overstates", "overstated", "unsupported", "not", "no",
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s%$]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/**
 * Overlap score in [0,1]: fraction of the *violation's* meaningful tokens that
 * appear in the bullet. We anchor on the violation (the shorter, more specific
 * text) so a long bullet doesn't dilute the match.
 */
function overlap(violationTokens: Set<string>, bulletTokens: Set<string>): number {
  if (violationTokens.size === 0) return 0;
  let hits = 0;
  for (const t of violationTokens) if (bulletTokens.has(t)) hits++;
  return hits / violationTokens.size;
}

const MATCH_THRESHOLD = 0.34; // ≥ ~a third of the violation's key words land in the bullet

/**
 * Map the truth-gate violations onto bullets. `resolved` is the set of violation
 * strings the user has already cleared (persisted in `content.resolved_violations`)
 * — those are excluded so the live status reflects the user's progress.
 */
export function mapFlags(
  bullets: ResumeBullet[],
  violations: string[] = [],
  resolved: string[] = [],
): FlagMapping {
  const resolvedSet = new Set(resolved);
  const outstanding = violations.filter((v) => !resolvedSet.has(v));

  const bulletTokens = bullets.map((b) => tokenize(b.text ?? ""));
  const byBulletMap = new Map<number, string[]>();
  const documentLevel: string[] = [];

  for (const v of outstanding) {
    const vt = tokenize(v);
    let best = -1;
    let bestScore = MATCH_THRESHOLD;
    for (let i = 0; i < bulletTokens.length; i++) {
      const score = overlap(vt, bulletTokens[i]);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best >= 0) {
      const list = byBulletMap.get(best) ?? [];
      list.push(v);
      byBulletMap.set(best, list);
    } else {
      documentLevel.push(v);
    }
  }

  const byBullet: BulletFlag[] = [...byBulletMap.entries()]
    .map(([bulletIndex, reasons]) => ({ bulletIndex, reasons }))
    .sort((a, b) => a.bulletIndex - b.bulletIndex);

  return {
    byBullet,
    documentLevel,
    grounded: outstanding.length === 0,
    outstanding: outstanding.length,
  };
}
