/**
 * Ingestion · orchestrator (docs/admin-ingestion.md). Table-driven, scope-aware,
 * and self-recording: every run opens an `ingestion_runs` row and writes counts
 * so /admin can show progress. Phase 1 is additive (scan → new → embed → insert);
 * diff/prune + a per-role Claude extract step move here with the IngestWorkflow
 * (Phase 2). Service-role; roles are read-only to users. No send.
 */
import { embeddings } from "@/lib/embeddings";
import { supabaseService } from "@/lib/supabase/service";
import { runSkill } from "@/agent/skills/run";
import extractRole from "@/agent/skills/extract_role";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";
import { companiesForScope, scanCompany, demandKeywords, type IngestScope } from "./scan";
import type { AtsPosting } from "@/lib/ats";

type Db = ReturnType<typeof supabaseService>;

const MAX_PER_COMPANY = 8;
/** Cap NEW roles fully processed (insert + Claude extract + embed) per run, to
 * stay within a bounded HTTP request. The durable Workflow (Phase 2b) lifts it. */
const MAX_NEW_PER_RUN = 15;

export interface IngestionSummary {
  runId: string;
  companies: number;
  scanned: number;
  added: number;
}

export async function runIngestion(
  opts: {
    trigger?: "admin" | "cron";
    scope?: IngestScope;
    maxPerCompany?: number;
    maxNewPerRun?: number;
  } = {},
): Promise<IngestionSummary> {
  const db = supabaseService();
  const scope = opts.scope ?? { kind: "all" };

  const { data: run } = await db
    .from("ingestion_runs")
    .insert({ trigger: opts.trigger ?? "cron", scope, status: "scanning" })
    .select("id")
    .single();
  const runId = (run as { id: string }).id;

  try {
    const [companies, kws] = await Promise.all([companiesForScope(scope), demandKeywords()]);
    const budget = opts.maxNewPerRun ?? MAX_NEW_PER_RUN;
    let scanned = 0;
    let added = 0;
    for (const c of companies) {
      const posts = await scanCompany(c, kws);
      scanned += posts.length;
      await db.from("companies").update({ last_scanned_at: new Date().toISOString() }).eq("id", c.id);
      if (added >= budget) continue; // keep scanning (counts) but stop adding
      added += await insertNew(db, posts, opts.maxPerCompany ?? MAX_PER_COMPANY, budget - added);
    }
    await db
      .from("ingestion_runs")
      .update({ status: "done", scanned, new_count: added, extracted: added, finished_at: new Date().toISOString() })
      .eq("id", runId);
    return { runId, companies: companies.length, scanned, added };
  } catch (e) {
    await db
      .from("ingestion_runs")
      .update({ status: "error", error: e instanceof Error ? e.message : String(e), finished_at: new Date().toISOString() })
      .eq("id", runId);
    throw e;
  }
}

/**
 * Insert the postings not already in the corpus, up to `remaining`. Each new
 * role is structured by Claude (extract) so it matches like the seed, then
 * embedded into the bge space. If embedding fails the role is rolled back so it
 * can't surface unmatched.
 */
async function insertNew(db: Db, posts: AtsPosting[], cap: number, remaining: number): Promise<number> {
  if (posts.length === 0 || remaining <= 0) return 0;
  const urls = posts.map((p) => p.url);
  const { data: existing } = await db.from("roles").select("url").in("url", urls);
  const have = new Set((existing ?? []).map((r) => r.url as string));
  const fresh = posts.filter((p) => !have.has(p.url)).slice(0, Math.min(cap, remaining));

  let added = 0;
  for (const p of fresh) {
    const description = p.description.slice(0, 8000);

    // Structure the JD (best-effort — recall still works on the embedding if it fails).
    let structured: {
      archetype?: string;
      seniority?: string;
      must_haves?: unknown;
      nice_to_haves?: unknown;
      keywords?: unknown;
    } | null = null;
    try {
      const { verdict } = await runSkill(extractRole, {
        userId: "system",
        data: { title: p.title, company: p.company, description },
      });
      await logAgentRuns(null, verdict.runs, { skill: extractRole.id });
      structured = parseModelJson(verdict.finalOutput);
    } catch {
      /* keep going unstructured */
    }
    const arr = (v: unknown) => (Array.isArray(v) ? v : []);

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
        archetype: structured?.archetype ?? null,
        seniority: structured?.seniority ? { level: structured.seniority } : null,
        must_haves: arr(structured?.must_haves),
        nice_to_haves: arr(structured?.nice_to_haves),
        keywords: arr(structured?.keywords),
        location: p.location ? { name: p.location } : null,
        fetched_at: new Date().toISOString().slice(0, 10),
        doc: { title: p.title, company: p.company, location: p.location, description, source: "ats", provider: p.provider, ...(structured ?? {}) },
      })
      .select("id")
      .single();
    if (error || !role) continue;

    try {
      const [vec] = await embeddings().embed([`${p.title}\n\n${description}`.slice(0, 4000)]);
      await db
        .from("role_embeddings")
        .upsert(
          { role_id: (role as { id: string }).id, chunk: "full", model: embeddings().model, embedding: JSON.stringify(vec) },
          { onConflict: "role_id,chunk" },
        );
      added++;
    } catch {
      await db.from("roles").delete().eq("id", (role as { id: string }).id);
    }
  }
  return added;
}
