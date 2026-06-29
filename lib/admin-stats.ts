import { supabaseService } from "@/lib/supabase/service";

/**
 * Admin "Models & evals / Costs" data (journey.html §6 admin panel,
 * architecture.md §4.1/§4.4). Reads agent_runs — every metered model call +
 * its quality-gate verdict. Service-role read is sanctioned here: the route
 * already re-checked role === 'admin' (lib/admin.requireAdmin), and agent_runs
 * is admin-only by RLS too. Aggregation is in JS over the most-recent window —
 * fine at current volume; a SQL view/RPC can replace it if runs grow large.
 */

export const RUNS_WINDOW = 2000;

export interface AdminStats {
  windowCount: number;
  capped: boolean;
  totals: { runs: number; costUsd: number; inTok: number; outTok: number };
  byModel: { key: string; runs: number; costUsd: number }[];
  bySkill: { key: string; runs: number; costUsd: number }[];
  /** Quality-gate pass-rate over PRIMARY skill outputs (excludes critic/truth/revise sub-calls). */
  quality: { judged: number; passed: number; needsEyes: number; passRate: number | null };
  recent: {
    skill: string | null;
    model: string;
    costUsd: number;
    status: string | null;
    created_at: string;
  }[];
}

interface Row {
  skill: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | string;
  judge_verdict: { status?: string } | null;
  created_at: string;
}

/** Sub-calls the gate makes about another skill's output — not user-facing outputs. */
function isSubCall(skill: string | null): boolean {
  return !!skill && skill.includes(":");
}

/**
 * Demand signal (the "keep me in the loop" intents). What roles / companies /
 * locations users are actually hunting for — the input to demand-driven
 * ingestion (we fetch what people want, growing the corpus). Admin-only; the
 * route already re-checked admin. Aggregated in JS over active intents.
 */
export interface DemandStats {
  watchers: number;
  pushing: number; // intents in push mode
  topRoles: { key: string; count: number }[];
  topCompanies: { key: string; count: number }[];
  topKeywords: { key: string; count: number }[];
  topLocations: { key: string; count: number }[];
  // Corpus / ingestion — how the demand-driven hunt is growing the role list.
  corpusTotal: number;
  ingestedTotal: number;
  // YC source — companies fed in from the yc-oss directory (lib/ingest/yc.ts).
  ycCompanies: number;
  ycEnabled: number;
  recentIngested: { company: string; role_title: string; created_at: string }[];
  recentRuns: {
    status: string;
    trigger: string;
    scanned: number;
    new_count: number;
    started_at: string;
  }[];
}

function rank(values: string[], limit = 12): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const raw of values) {
    const k = raw.trim();
    if (!k) continue;
    m.set(k.toLowerCase(), (m.get(k.toLowerCase()) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

interface IntentRow {
  target_role: string | null;
  keywords: string[] | null;
  companies: string[] | null;
  location: string | null;
  mode: string | null;
}

export async function getDemandStats(): Promise<DemandStats> {
  const db = supabaseService();
  const { data } = await db
    .from("intents")
    .select("target_role, keywords, companies, location, mode")
    .eq("status", "active")
    .limit(5000);
  const rows = (data ?? []) as IntentRow[];

  const [
    { count: corpusTotal },
    { count: ingestedTotal },
    { count: ycCompanies },
    { count: ycEnabled },
    recent,
    runs,
  ] = await Promise.all([
    db.from("roles").select("*", { count: "exact", head: true }),
    db.from("roles").select("*", { count: "exact", head: true }).eq("source", "ats"),
    db.from("companies").select("*", { count: "exact", head: true }).eq("source", "yc"),
    db
      .from("companies")
      .select("*", { count: "exact", head: true })
      .eq("source", "yc")
      .eq("enabled", true),
    db
      .from("roles")
      .select("company, role_title, created_at")
      .eq("source", "ats")
      .order("created_at", { ascending: false })
      .limit(8),
    db
      .from("ingestion_runs")
      .select("status, trigger, scanned, new_count, started_at")
      .order("started_at", { ascending: false })
      .limit(5),
  ]);

  return {
    watchers: rows.length,
    pushing: rows.filter((r) => r.mode === "push").length,
    topRoles: rank(rows.map((r) => r.target_role ?? "").filter(Boolean)),
    topCompanies: rank(rows.flatMap((r) => r.companies ?? [])),
    topKeywords: rank(rows.flatMap((r) => r.keywords ?? [])),
    topLocations: rank(rows.map((r) => r.location ?? "").filter(Boolean)),
    corpusTotal: corpusTotal ?? 0,
    ingestedTotal: ingestedTotal ?? 0,
    ycCompanies: ycCompanies ?? 0,
    ycEnabled: ycEnabled ?? 0,
    recentIngested: (recent.data ?? []) as DemandStats["recentIngested"],
    recentRuns: (runs.data ?? []) as DemandStats["recentRuns"],
  };
}

export async function getAdminStats(): Promise<AdminStats> {
  const db = supabaseService();
  const { data } = await db
    .from("agent_runs")
    .select("skill, model, input_tokens, output_tokens, cost_usd, judge_verdict, created_at")
    .order("created_at", { ascending: false })
    .limit(RUNS_WINDOW);

  const rows = (data ?? []) as Row[];
  const num = (v: number | string) => (typeof v === "string" ? parseFloat(v) : v) || 0;

  const totals = { runs: rows.length, costUsd: 0, inTok: 0, outTok: 0 };
  const model = new Map<string, { runs: number; costUsd: number }>();
  const skill = new Map<string, { runs: number; costUsd: number }>();
  const quality = { judged: 0, passed: 0, needsEyes: 0, passRate: null as number | null };

  for (const r of rows) {
    const cost = num(r.cost_usd);
    totals.costUsd += cost;
    totals.inTok += r.input_tokens;
    totals.outTok += r.output_tokens;

    const mk = model.get(r.model) ?? { runs: 0, costUsd: 0 };
    mk.runs += 1;
    mk.costUsd += cost;
    model.set(r.model, mk);

    const sName = r.skill ?? "—";
    const sk = skill.get(sName) ?? { runs: 0, costUsd: 0 };
    sk.runs += 1;
    sk.costUsd += cost;
    skill.set(sName, sk);

    // Quality only over primary outputs, and only rows that carry a verdict.
    if (!isSubCall(r.skill) && r.judge_verdict?.status) {
      quality.judged += 1;
      if (r.judge_verdict.status === "passed") quality.passed += 1;
      else quality.needsEyes += 1;
    }
  }
  if (quality.judged > 0) quality.passRate = Math.round((quality.passed / quality.judged) * 100);

  const sortByCost = (m: Map<string, { runs: number; costUsd: number }>) =>
    [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.costUsd - a.costUsd);

  return {
    windowCount: rows.length,
    capped: rows.length >= RUNS_WINDOW,
    totals,
    byModel: sortByCost(model),
    bySkill: sortByCost(skill),
    quality,
    recent: rows.slice(0, 20).map((r) => ({
      skill: r.skill,
      model: r.model,
      costUsd: num(r.cost_usd),
      status: r.judge_verdict?.status ?? null,
      created_at: r.created_at,
    })),
  };
}
