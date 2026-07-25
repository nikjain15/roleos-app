/**
 * The canonical, typed profile (docs/specs/profile-data-layer.md, Layer 1).
 *
 * Every source — LinkedIn · GitHub · résumé — normalizes into THIS shape instead
 * of a text blob, so every fact is typed, traceable to a `source`, and carries a
 * `confidence`. The JSON is deliberately "table-shaped": each experience/skill/
 * project is a discrete object whose fields map 1:1 to a future SQL column, so
 * promoting to relational tables (Decision 2, Option B) is a mechanical explode,
 * not a redesign.
 *
 * `parseCanonicalProfile` is TOLERANT: it coerces arbitrary (LLM-produced) JSON
 * into a valid CanonicalProfile, dropping anything malformed — a body-less or
 * hostile object can never crash a consumer or inject non-strings into the UI.
 */

export type ProfileSource = "linkedin" | "github" | "resume" | "user";
export const PROFILE_SCHEMA_VERSION = 1 as const;

export interface Fact<T> {
  value: T;
  source: ProfileSource;
  confidence: number; // 0..1
  at: string; // ISO timestamp (stamped by the caller — never Date.now() in schema)
}

export interface ExperienceItem {
  title: string;
  company: string;
  start?: string;
  end?: string;
  highlights: string[];
  source: ProfileSource;
  confidence: number;
}

export interface EducationItem {
  school: string;
  degree?: string;
  field?: string;
  year?: string;
  source: ProfileSource;
}

export interface SkillItem {
  canonical: string; // normalized to the taxonomy ("ml" → "Machine Learning")
  raw?: string;
  evidence?: string;
  source: ProfileSource;
  confidence: number;
}

export interface ProjectItem {
  name: string;
  description?: string;
  tech: string[];
  stars?: number;
  url?: string;
  source: ProfileSource;
}

export interface ProfileSignals {
  seniority?: string;
  domains: string[];
  strengths: string[];
  target?: {
    role?: string;
    level?: string;
    comp?: string;
    location?: string;
    cares_about: string[];
  };
}

export interface CanonicalProfile {
  version: typeof PROFILE_SCHEMA_VERSION;
  identity: {
    name?: Fact<string>;
    headline?: Fact<string>;
    location?: Fact<string>;
    links: { linkedin?: string; github?: string; site?: string };
  };
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: SkillItem[];
  projects: ProjectItem[];
  signals: ProfileSignals;
}

// ── tolerant coercion helpers ────────────────────────────────────────────────
const SOURCES: ReadonlySet<string> = new Set(["linkedin", "github", "resume", "user"]);

const str = (v: unknown, max = 2000): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

const strList = (v: unknown, max = 40, itemMax = 300): string[] =>
  Array.isArray(v)
    ? v.map((x) => str(x, itemMax)).filter((s): s is string => !!s).slice(0, max)
    : [];

const source = (v: unknown, fallback: ProfileSource): ProfileSource =>
  typeof v === "string" && SOURCES.has(v) ? (v as ProfileSource) : fallback;

const conf = (v: unknown, fallback = 0.6): number =>
  typeof v === "number" && v >= 0 && v <= 1 ? v : fallback;

function fact(v: unknown, src: ProfileSource, at: string): Fact<string> | undefined {
  if (v == null) return undefined;
  const o = typeof v === "object" ? (v as Record<string, unknown>) : { value: v };
  const value = str(o.value ?? v);
  if (!value) return undefined;
  return { value, source: source(o.source, src), confidence: conf(o.confidence), at };
}

/** Coerce arbitrary JSON → a valid CanonicalProfile. Never throws. */
export function parseCanonicalProfile(
  input: unknown,
  opts: { defaultSource: ProfileSource; at: string },
): CanonicalProfile {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const src = opts.defaultSource;
  const id = (o.identity && typeof o.identity === "object" ? o.identity : {}) as Record<string, unknown>;
  const links = (id.links && typeof id.links === "object" ? id.links : {}) as Record<string, unknown>;
  const sig = (o.signals && typeof o.signals === "object" ? o.signals : {}) as Record<string, unknown>;
  const tgt = (sig.target && typeof sig.target === "object" ? sig.target : undefined) as
    | Record<string, unknown>
    | undefined;

  const arr = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];

  return {
    version: PROFILE_SCHEMA_VERSION,
    identity: {
      name: fact(id.name, src, opts.at),
      headline: fact(id.headline, src, opts.at),
      location: fact(id.location, src, opts.at),
      links: {
        linkedin: str(links.linkedin, 300),
        github: str(links.github, 300),
        site: str(links.site, 300),
      },
    },
    experience: arr(o.experience)
      .flatMap((e): ExperienceItem[] => {
        const title = str(e.title);
        const company = str(e.company);
        if (!title || !company) return [];
        return [{
          title,
          company,
          start: str(e.start, 40),
          end: str(e.end, 40),
          highlights: strList(e.highlights, 12, 600),
          source: source(e.source, src),
          confidence: conf(e.confidence),
        }];
      })
      .slice(0, 20),
    education: arr(o.education)
      .flatMap((e): EducationItem[] => {
        const school = str(e.school);
        if (!school) return [];
        return [{
          school,
          degree: str(e.degree, 200),
          field: str(e.field, 200),
          year: str(e.year, 40),
          source: source(e.source, src),
        }];
      })
      .slice(0, 10),
    skills: arr(o.skills)
      .flatMap((sk): SkillItem[] => {
        const canonical = str(sk.canonical ?? sk.name ?? sk.value, 80);
        if (!canonical) return [];
        return [{
          canonical,
          raw: str(sk.raw, 80),
          evidence: str(sk.evidence, 300),
          source: source(sk.source, src),
          confidence: conf(sk.confidence),
        }];
      })
      .slice(0, 60),
    projects: arr(o.projects)
      .flatMap((p): ProjectItem[] => {
        const name = str(p.name, 200);
        if (!name) return [];
        return [{
          name,
          description: str(p.description, 600),
          tech: strList(p.tech, 20, 40),
          stars: typeof p.stars === "number" && p.stars >= 0 ? Math.floor(p.stars) : undefined,
          url: str(p.url, 300),
          source: source(p.source, src),
        }];
      })
      .slice(0, 20),
    signals: {
      seniority: str(sig.seniority, 80),
      domains: strList(sig.domains, 20, 80),
      strengths: strList(sig.strengths, 20, 300),
      target: tgt
        ? {
            role: str(tgt.role, 200),
            level: str(tgt.level, 80),
            comp: str(tgt.comp, 120),
            location: str(tgt.location, 120),
            cares_about: strList(tgt.cares_about, 12, 200),
          }
        : undefined,
    },
  };
}

/** An empty-but-valid profile (used as a base to merge sources into). */
export function emptyProfile(): CanonicalProfile {
  return {
    version: PROFILE_SCHEMA_VERSION,
    identity: { links: {} },
    experience: [],
    education: [],
    skills: [],
    projects: [],
    signals: { domains: [], strengths: [] },
  };
}
