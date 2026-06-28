import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service";
import { ingestCompanies } from "@/lib/ingest";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Demand-driven ingestion run (the ambient hunt). Called by the cron worker.
 * Companies = what users asked for (intents.companies) first, then a small seed
 * list so the corpus keeps growing even before there's much demand. Bounded per
 * run; dedupe makes re-runs cheap. Secret-gated; service-role; no send.
 */
const MAX_COMPANIES_PER_RUN = 8;
const MAX_ROLES_PER_COMPANY = 6;

// On-target companies known to publish on a public ATS — a floor for ingestion.
const SEED_COMPANIES = [
  "Ramp", "Notion", "Figma", "Anthropic", "OpenAI", "Scale AI",
  "Databricks", "Rippling", "Brex", "Mercury", "Vanta", "Webflow",
];

export async function POST(req: Request): Promise<Response> {
  const expected = env().CRON_SECRET;
  if (!expected || req.headers.get("x-cron-secret") !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = supabaseService();

  // Demand first: companies + keywords from active intents.
  const { data: intents } = await db
    .from("intents")
    .select("companies, keywords")
    .eq("status", "active")
    .limit(2000);

  const demandCompanies = new Set<string>();
  const keywords = new Set<string>();
  for (const r of intents ?? []) {
    for (const c of (r.companies as string[] | null) ?? []) demandCompanies.add(c);
    for (const k of (r.keywords as string[] | null) ?? []) keywords.add(k);
  }

  // Demand companies, then seed fill, deduped (case-insensitive), capped.
  const seen = new Set<string>();
  const list: { company: string; keywords?: string[] }[] = [];
  for (const c of [...demandCompanies, ...SEED_COMPANIES]) {
    const key = c.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    list.push({ company: c, keywords: [...keywords] });
    if (list.length >= MAX_COMPANIES_PER_RUN) break;
  }

  const results = await ingestCompanies(list, { maxPerCompany: MAX_ROLES_PER_COMPANY });
  const added = results.reduce((a, r) => a + r.added, 0);
  return NextResponse.json({ companies: results.length, added, results });
}
