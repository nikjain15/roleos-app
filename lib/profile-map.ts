/**
 * Deterministic source → CanonicalProfile mappers (docs/specs/profile-data-layer.md,
 * Layer 1, hybrid approach). LinkedIn and GitHub already arrive as STRUCTURED data
 * — so we map them straight into canonical facts (high confidence, zero invention),
 * and reserve the LLM structurer for the one genuinely messy source (the résumé).
 *
 * Pure + deterministic: same input → same output. No model calls, no I/O. The
 * caller passes `at` (an ISO timestamp) — the schema never calls Date.now().
 */

import {
  emptyProfile,
  type CanonicalProfile,
  type EducationItem,
  type ExperienceItem,
  type Fact,
  type ProjectItem,
  type SkillItem,
} from "@/lib/profile-schema";

// ── LinkedIn (apimaestro/linkedin-profile-detail structured item) ────────────
export interface LinkedInStructured {
  basic_info?: {
    fullname?: string;
    headline?: string;
    location?: { full?: string } | string;
    current_company?: string;
    about?: string;
    top_skills?: string[] | string;
  };
  experience?: Array<{ title?: string; company?: string; duration?: string; description?: string }>;
  education?: Array<{ school?: string; degree?: string; field_of_study?: string; duration?: string }>;
}

const s = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/** LinkedIn structured item → canonical facts. High confidence (self-authored, current). */
export function linkedinToProfile(item: LinkedInStructured, at: string): CanonicalProfile {
  const p = emptyProfile();
  const b = item.basic_info ?? {};
  const loc = typeof b.location === "string" ? b.location : b.location?.full;

  if (s(b.fullname)) p.identity.name = { value: s(b.fullname)!, source: "linkedin", confidence: 0.95, at };
  if (s(b.headline)) p.identity.headline = { value: s(b.headline)!, source: "linkedin", confidence: 0.9, at };
  if (s(loc)) p.identity.location = { value: s(loc)!, source: "linkedin", confidence: 0.9, at };
  if (s(b.about)) p.signals.strengths.push(s(b.about)!.slice(0, 300));

  const skills = Array.isArray(b.top_skills) ? b.top_skills : s(b.top_skills)?.split(/[,;]/) ?? [];
  for (const raw of skills) {
    const name = s(raw);
    if (name) p.skills.push({ canonical: name, raw: name, source: "linkedin", confidence: 0.8 } satisfies SkillItem);
  }

  for (const e of item.experience ?? []) {
    const title = s(e.title);
    const company = s(e.company);
    if (!title || !company) continue;
    const [start, end] = splitDuration(e.duration);
    p.experience.push({
      title,
      company,
      start,
      end,
      highlights: s(e.description) ? [s(e.description)!.slice(0, 600)] : [],
      source: "linkedin",
      confidence: 0.9,
    } satisfies ExperienceItem);
  }

  for (const e of item.education ?? []) {
    const school = s(e.school);
    if (!school) continue;
    p.education.push({
      school,
      degree: s(e.degree),
      field: s(e.field_of_study),
      year: s(e.duration),
      source: "linkedin",
    } satisfies EducationItem);
  }

  return p;
}

/** "2019 - 2023" / "Jan 2019 - Present" → [start, end]. Best-effort, never throws. */
function splitDuration(d?: string): [string | undefined, string | undefined] {
  const t = s(d);
  if (!t) return [undefined, undefined];
  const parts = t.split(/\s*[-–—]\s*/);
  return [s(parts[0]), s(parts[1])];
}

// ── GitHub (public REST API shapes) ──────────────────────────────────────────
export interface GitHubUserLite {
  name?: string | null;
  login?: string;
  bio?: string | null;
  company?: string | null;
  location?: string | null;
  blog?: string | null;
}
export interface GitHubRepoLite {
  name: string;
  description?: string | null;
  language?: string | null;
  stargazers_count?: number;
  fork?: boolean;
  archived?: boolean;
  html_url?: string;
}

/** GitHub user + repos → canonical facts. Highest confidence — it's literally their work. */
export function githubToProfile(user: GitHubUserLite, repos: GitHubRepoLite[], at: string): CanonicalProfile {
  const p = emptyProfile();
  if (s(user.name)) p.identity.name = { value: s(user.name)!, source: "github", confidence: 0.85, at };
  if (s(user.location)) p.identity.location = { value: s(user.location)!, source: "github", confidence: 0.85, at };
  if (user.login) p.identity.links.github = `https://github.com/${user.login}`;
  if (s(user.blog)) p.identity.links.site = s(user.blog);
  if (s(user.bio)) p.signals.strengths.push(s(user.bio)!.slice(0, 300));

  const own = repos.filter((r) => !r.fork && !r.archived);

  // Projects: top by stars — real, shipped work.
  const top = [...own].sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0)).slice(0, 8);
  for (const r of top) {
    p.projects.push({
      name: r.name,
      description: s(r.description),
      tech: s(r.language) ? [s(r.language)!] : [],
      stars: typeof r.stargazers_count === "number" ? r.stargazers_count : undefined,
      url: s(r.html_url),
      source: "github",
    } satisfies ProjectItem);
  }

  // Languages they actually work in → skills (by repo count, most-used first).
  const langCount = new Map<string, number>();
  for (const r of own) if (s(r.language)) langCount.set(r.language!, (langCount.get(r.language!) ?? 0) + 1);
  for (const [lang] of [...langCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    p.skills.push({ canonical: lang, raw: lang, evidence: "GitHub repos", source: "github", confidence: 0.9 });
  }

  return p;
}

// ── merge / reconcile ────────────────────────────────────────────────────────
const keepHigher = <T>(a: Fact<T> | undefined, b: Fact<T> | undefined): Fact<T> | undefined => {
  if (!a) return b;
  if (!b) return a;
  return b.confidence > a.confidence ? b : a;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Merge canonical profiles from multiple sources into one. Order matters only for
 * ties — pass sources most-authoritative-last is NOT required (we reconcile by
 * confidence). Identity keeps the highest-confidence fact per field; experience/
 * education/projects dedupe by natural key; skills dedupe to the taxonomy keeping
 * the highest confidence and unioning provenance.
 */
export function mergeProfiles(profiles: CanonicalProfile[]): CanonicalProfile {
  const out = emptyProfile();
  if (profiles.length === 0) return out;

  // identity — highest-confidence wins per field; links union.
  for (const p of profiles) {
    out.identity.name = keepHigher(out.identity.name, p.identity.name);
    out.identity.headline = keepHigher(out.identity.headline, p.identity.headline);
    out.identity.location = keepHigher(out.identity.location, p.identity.location);
    out.identity.links = {
      linkedin: out.identity.links.linkedin ?? p.identity.links.linkedin,
      github: out.identity.links.github ?? p.identity.links.github,
      site: out.identity.links.site ?? p.identity.links.site,
    };
  }

  // experience — dedupe by title+company (keep the higher-confidence copy).
  const expByKey = new Map<string, ExperienceItem>();
  for (const p of profiles) {
    for (const e of p.experience) {
      const k = `${norm(e.title)}@${norm(e.company)}`;
      const prev = expByKey.get(k);
      if (!prev || e.confidence > prev.confidence) expByKey.set(k, e);
    }
  }
  out.experience = [...expByKey.values()];

  // education — dedupe by school (+ degree).
  const eduByKey = new Map<string, EducationItem>();
  for (const p of profiles) {
    for (const e of p.education) eduByKey.set(`${norm(e.school)}|${norm(e.degree ?? "")}`, e);
  }
  out.education = [...eduByKey.values()];

  // projects — dedupe by name (keep the one with more stars / a URL).
  const projByKey = new Map<string, ProjectItem>();
  for (const p of profiles) {
    for (const pr of p.projects) {
      const prev = projByKey.get(norm(pr.name));
      if (!prev || (pr.stars ?? 0) > (prev.stars ?? 0)) projByKey.set(norm(pr.name), pr);
    }
  }
  out.projects = [...projByKey.values()];

  // skills — dedupe to the taxonomy; keep highest confidence, union sources into evidence.
  const skillByKey = new Map<string, SkillItem>();
  for (const p of profiles) {
    for (const sk of p.skills) {
      const k = norm(sk.canonical);
      const prev = skillByKey.get(k);
      if (!prev) skillByKey.set(k, { ...sk });
      else if (sk.confidence > prev.confidence) skillByKey.set(k, { ...sk });
    }
  }
  out.skills = [...skillByKey.values()];

  // signals — union domains/strengths (deduped); target from whichever source has one.
  const domains = new Set<string>();
  const strengths = new Set<string>();
  for (const p of profiles) {
    p.signals.domains.forEach((d) => domains.add(d));
    p.signals.strengths.forEach((st) => strengths.add(st));
    if (p.signals.target && !out.signals.target) out.signals.target = p.signals.target;
    if (p.signals.seniority && !out.signals.seniority) out.signals.seniority = p.signals.seniority;
  }
  out.signals.domains = [...domains];
  out.signals.strengths = [...strengths];

  return out;
}
