/**
 * Loads the REAL role corpus (seed/roles/*.json — the same extracted postings
 * that seed the production `roles` table) into flat documents the offline live
 * retriever can rank. Self-contained: filesystem only, no DB, no network, no
 * model. The doc text deliberately EXCLUDES the human-assigned `archetype`
 * label so archetype-based relevance labels stay independent of the retriever's
 * features (it must recover the label from the free text, not copy it).
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export interface RoleDoc {
  id: string;
  company: string;
  role_title: string;
  archetype: string;
  /** Free text used for retrieval (title, keywords, surface, responsibilities). */
  text: string;
}

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const ROLES_DIR = join(ROOT, "seed", "roles");

function slug(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".json") ? [p] : [];
  });
}

interface RawRole {
  company?: string;
  role_title?: string;
  ats_job_id?: string;
  archetype?: string;
  top_keywords?: string[];
  scope?: { surface?: string; core_responsibilities?: string[] };
  seniority?: { level?: string };
  must_haves?: Array<{ raw_text_from_jd?: string; domain?: string }>;
}

/** Build the retrieval text from real posting fields (NOT the archetype label). */
function docText(r: RawRole): string {
  const parts: string[] = [];
  if (r.role_title) parts.push(r.role_title);
  if (r.seniority?.level) parts.push(r.seniority.level);
  if (r.scope?.surface) parts.push(r.scope.surface);
  for (const c of r.scope?.core_responsibilities ?? []) parts.push(c);
  for (const k of r.top_keywords ?? []) parts.push(k);
  for (const m of r.must_haves ?? []) {
    if (m.raw_text_from_jd) parts.push(m.raw_text_from_jd);
    if (m.domain) parts.push(m.domain.replace(/_/g, " "));
  }
  return parts.join(" \n");
}

let cache: RoleDoc[] | null = null;

export function loadCorpus(): RoleDoc[] {
  if (cache) return cache;
  const seen = new Set<string>();
  const docs: RoleDoc[] = [];
  for (const f of walk(ROLES_DIR)) {
    let r: RawRole;
    try {
      r = JSON.parse(readFileSync(f, "utf8")) as RawRole;
    } catch {
      continue;
    }
    const company = r.company ?? "unknown";
    const title = r.role_title ?? "unknown";
    const base = `${slug(company)}__${slug(title)}`;
    const id = r.ats_job_id ? `${base}__${r.ats_job_id.slice(0, 8)}` : base;
    if (seen.has(id)) continue;
    seen.add(id);
    docs.push({
      id,
      company,
      role_title: title,
      archetype: r.archetype ?? "Unknown",
      text: docText(r),
    });
  }
  cache = docs;
  return docs;
}
