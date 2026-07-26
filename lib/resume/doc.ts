/**
 * The structured résumé document model (docs/specs/resume-editor-v2.md
 * §"Export & formatting", §"The editor UX" #2).
 *
 * A tailored résumé is a set of EXPERIENCE sections (Company · Title · Dates → its
 * lines), not a flat bullet list. This shape is what per-section strength pills
 * attach to AND what the ATS-safe export needs (recruiters + parsers expect
 * Company · Title · Dates → bullets). One structured model feeds both.
 *
 * `parseResumeDoc` is TOLERANT and BACKWARD-COMPATIBLE: it reads the new
 * `{ experience: [...] }` shape, and upgrades the legacy flat `{ bullets: [...] }`
 * shape into a single implicit section — so every existing artifact still renders,
 * scores, and exports while the tailor skill + editor migrate to sections. Never
 * throws; malformed input coerces to an empty-but-valid doc.
 *
 * Ids are stable within a parse (index-derived: `exp0`, `exp0-l1`), so the scorer's
 * evidence attribution and section grouping line up. Pure — no I/O, unit-tested.
 */

import type { ResumeSection } from "./score";

/** A scorer bullet — the minimal {id, text} the judge + roll-up consume. */
export interface ResumeBullet {
  id: string;
  text: string;
}

/** One résumé line inside an experience section. */
export interface ResumeLine {
  id: string;
  text: string;
  rationale?: string;
  evidence?: string;
  /** ✓-approve lock (a later P2 slice); RO won't rewrite a locked line. */
  locked?: boolean;
}

/** One experience block: Company · Title · Dates → its lines. */
export interface ResumeExperience {
  id: string;
  company: string;
  title: string;
  dates?: string;
  lines: ResumeLine[];
}

export interface ResumeDoc {
  summary: string;
  experience: ResumeExperience[];
  skills: string[];
  keywords_injected: string[];
  fit_lift: string;
  truth_note: string;
}

// ── tolerant coercion ────────────────────────────────────────────────────────

const str = (v: unknown, max = 2000): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

const strList = (v: unknown, max = 100, itemMax = 300): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, itemMax)).filter(Boolean).slice(0, max) : [];

const objList = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];

function coerceLine(raw: unknown, id: string): ResumeLine | null {
  const o = typeof raw === "object" && raw ? (raw as Record<string, unknown>) : { text: raw };
  const text = str(o.text ?? raw, 600);
  if (!text) return null;
  return {
    id,
    text,
    rationale: str(o.rationale, 600) || undefined,
    evidence: str(o.evidence, 600) || undefined,
    locked: o.locked === true || undefined,
  };
}

function coerceExperience(raw: Record<string, unknown>, expId: string): ResumeExperience | null {
  const lines = objList(raw.lines ?? raw.bullets)
    .map((l, i) => coerceLine(l, `${expId}-l${i}`))
    .filter((l): l is ResumeLine => l !== null);
  const company = str(raw.company, 200);
  const title = str(raw.title, 200);
  // A section with no lines and no header is nothing to render.
  if (lines.length === 0 && !company && !title) return null;
  return { id: expId, company, title, dates: str(raw.dates, 80) || undefined, lines };
}

/**
 * Coerce any stored artifact content → a valid ResumeDoc. Reads the new
 * `experience[]` shape; upgrades legacy flat `bullets[]` into one section.
 */
export function parseResumeDoc(content: unknown): ResumeDoc {
  const o = (content && typeof content === "object" ? content : {}) as Record<string, unknown>;

  let experience: ResumeExperience[] = objList(o.experience)
    .map((e, i) => coerceExperience(e, `exp${i}`))
    .filter((e): e is ResumeExperience => e !== null)
    .slice(0, 20);

  // Legacy upgrade: a flat bullet list becomes a single implicit section.
  if (experience.length === 0) {
    const legacy = coerceExperience({ title: "Experience", lines: o.bullets }, "exp0");
    if (legacy && legacy.lines.length > 0) experience = [legacy];
  }

  return {
    summary: str(o.summary, 2000),
    experience,
    skills: strList(o.skills, 60, 80),
    keywords_injected: strList(o.keywords_injected, 100, 80),
    fit_lift: str(o.fit_lift, 600),
    truth_note: str(o.truth_note, 600),
  };
}

// ── scorer adapters (feed lib/resume/score + judge) ──────────────────────────

/** Every line, flattened to scorer bullets ({id, text}), in document order. */
export function scorerBullets(doc: ResumeDoc): ResumeBullet[] {
  return doc.experience.flatMap((exp) => exp.lines.map((l) => ({ id: l.id, text: l.text })));
}

/** Each experience block as a scorer section (id, title, its line ids). */
export function scorerSections(doc: ResumeDoc): ResumeSection[] {
  return doc.experience.map((exp) => ({
    id: exp.id,
    title: exp.title || exp.company || "Experience",
    bulletIds: exp.lines.map((l) => l.id),
  }));
}

/** A flat, index-addressable view of every line — for index-based consumers
 *  (the editor's flag/reground plumbing) during the migration off flat bullets. */
export function flattenLines(
  doc: ResumeDoc,
): Array<{ line: ResumeLine; expId: string; expIndex: number; lineIndex: number; globalIndex: number }> {
  const out: Array<{ line: ResumeLine; expId: string; expIndex: number; lineIndex: number; globalIndex: number }> = [];
  let g = 0;
  doc.experience.forEach((exp, expIndex) => {
    exp.lines.forEach((line, lineIndex) => {
      out.push({ line, expId: exp.id, expIndex, lineIndex, globalIndex: g++ });
    });
  });
  return out;
}
