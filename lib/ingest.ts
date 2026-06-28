/**
 * Demand-driven role ingestion (closes the "RO hunts in the background" loop).
 * Reads the companies people actually want (intents → admin demand), pulls their
 * open roles from public ATS boards, keeps the relevant ones, and adds the fresh
 * ones to the corpus — embedded into the SAME vector space as the seed 557, so
 * matching just works. Idempotent: dedupes by URL before inserting.
 *
 * Service-role (roles are read-only to users; ingestion is system-side). No send.
 */
import { embeddings } from "@/lib/embeddings";
import { supabaseService } from "@/lib/supabase/service";
import { fetchCompanyPostings } from "@/lib/ats";

// Keep the corpus on-target: senior product / AI / ML roles, not every req.
const RELEVANT_TITLE =
  /\b(product manager|product lead|product owner|head of product|director of product|vp product|group product|principal product|staff product|\bpm\b|\bai\b|\bml\b|machine learning|gen ?ai|llm|data product|product, )\b/i;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface IngestResult {
  company: string;
  found: number;
  relevant: number;
  added: number;
}

export async function ingestCompany(
  company: string,
  opts: { slug?: string; keywords?: string[]; max?: number } = {},
): Promise<IngestResult> {
  const posts = await fetchCompanyPostings(company, opts.slug);
  if (posts.length === 0) return { company, found: 0, relevant: 0, added: 0 };

  const kwRe = opts.keywords?.length
    ? new RegExp(opts.keywords.map(escapeRe).join("|"), "i")
    : null;
  const relevant = posts.filter((p) => RELEVANT_TITLE.test(p.title) || (kwRe?.test(p.title) ?? false));
  if (relevant.length === 0) return { company, found: posts.length, relevant: 0, added: 0 };

  const db = supabaseService();
  // Dedupe by URL against what's already in the corpus.
  const urls = relevant.map((p) => p.url);
  const { data: existing } = await db.from("roles").select("url").in("url", urls);
  const have = new Set((existing ?? []).map((r) => r.url as string));
  const fresh = relevant.filter((p) => !have.has(p.url)).slice(0, opts.max ?? 25);

  let added = 0;
  for (const p of fresh) {
    const description = p.description.slice(0, 8000);
    const { data: role, error } = await db
      .from("roles")
      .insert({
        company: p.company,
        role_title: p.title,
        url: p.url,
        ats_provider: p.provider,
        ats_job_id: p.externalId,
        source: "ats",
        description,
        location: p.location ? { name: p.location } : null,
        fetched_at: new Date().toISOString().slice(0, 10),
        // doc is NOT NULL — the source-of-truth blob for this posting.
        doc: { title: p.title, company: p.company, location: p.location, description, source: "ats", provider: p.provider },
      })
      .select("id")
      .single();
    if (error || !role) continue;

    try {
      const [vec] = await embeddings().embed([`${p.title}\n\n${description}`.slice(0, 4000)]);
      await db
        .from("role_embeddings")
        .upsert(
          { role_id: role.id, chunk: "full", model: embeddings().model, embedding: JSON.stringify(vec) },
          { onConflict: "role_id,chunk" },
        );
      added++;
    } catch {
      // Embedding failed — drop the orphan role so it can't surface unmatched.
      await db.from("roles").delete().eq("id", role.id);
    }
  }
  return { company, found: posts.length, relevant: relevant.length, added };
}

export async function ingestCompanies(
  companies: { company: string; slug?: string; keywords?: string[] }[],
  opts: { maxPerCompany?: number } = {},
): Promise<IngestResult[]> {
  const out: IngestResult[] = [];
  for (const c of companies) {
    out.push(await ingestCompany(c.company, { slug: c.slug, keywords: c.keywords, max: opts.maxPerCompany }));
  }
  return out;
}
