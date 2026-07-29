/**
 * RO's shared working-context assembler (docs/specs/ro-memory.md, M0 — the
 * foundation Option B's durable memory plugs into). Today every RO surface
 * re-assembles its own slice of the user's state, and the dock doesn't even load
 * the master profile — RO is amnesiac about who you are. This centralizes the
 * EPHEMERAL working context (profile + goal + pipeline + top pursue) into one
 * RLS-scoped read, so every surface (dock now; Explore + the résumé command bar
 * next) grounds on the same picture. M1 layers the DURABLE notebook on top.
 *
 * The compaction is PURE (unit-tested); the load is a thin RLS-scoped bridge.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadActiveGoal } from "@/lib/goal";
import { parseCanonicalProfile, type CanonicalProfile } from "@/lib/profile-schema";
import { recallMemory, type RoNote } from "@/lib/ro/memory";
import { logError } from "@/lib/log";

export interface RoProfileSummary {
  name?: string;
  headline?: string;
  seniority?: string;
  /** A few canonical skills — enough to ground, not the whole list. */
  topSkills: string[];
  /** Recent roles as "Title @ Company". */
  recentRoles: string[];
  /** The user's stated target ("role · level · comp"), if any. */
  target?: string;
}

export interface RoGoal {
  target: string | null;
  deadline: string | null;
  verdict: string | null;
  weekly_apps_target: number | null;
  best_lever: string | null;
}

export interface RoPipeline {
  pursue_matches: number;
  saved: number;
  applied: number;
  interviewing: number;
  offers: number;
  resumes_ready: number;
}

export interface RoPursueRole {
  id: string;
  company: string;
  title: string;
}

export interface RoContext {
  profile: RoProfileSummary | null;
  goal: RoGoal | null;
  pipeline: RoPipeline;
  topPursue: RoPursueRole[];
  /** Top-k notes from the durable notebook (M1) relevant to the current query. */
  memory: RoNote[];
}

const MAX_SKILLS = 8;
const MAX_ROLES = 4;

/** Compact a canonical profile to the few facts RO needs in a prompt. Pure. */
export function profileSummary(profile: CanonicalProfile): RoProfileSummary {
  const t = profile.signals.target;
  const target = t ? [t.role, t.level, t.comp].filter(Boolean).join(" · ") || undefined : undefined;
  return {
    name: profile.identity.name?.value,
    headline: profile.identity.headline?.value,
    seniority: profile.signals.seniority,
    topSkills: profile.skills.slice(0, MAX_SKILLS).map((s) => s.canonical),
    recentRoles: profile.experience.slice(0, MAX_ROLES).map((e) => `${e.title} @ ${e.company}`),
    target,
  };
}

type MatchRow = {
  role_id: string;
  recommendation: string | null;
  status: string;
  fit_score: number | null;
  roles: { company: string; role_title: string } | null;
};

/**
 * Load the caller's working context in one RLS-scoped pass. Safe on empty data:
 * a brand-new user gets a null profile, null goal, zeroed pipeline, and no
 * pursue roles — every surface renders exactly as before.
 */
export async function assembleContext(
  supabase: SupabaseClient,
  userId: string,
  opts: { recallQuery?: string; recallScope?: string } = {},
): Promise<RoContext> {
  const [mpRes, goalRes, matchAgg, appAgg, readyAgg] = await Promise.all([
    supabase.from("master_profile").select("data").eq("user_id", userId).maybeSingle<{ data: { profile?: unknown } | null }>(),
    loadActiveGoal(supabase),
    supabase.from("matches").select("role_id, recommendation, status, fit_score, roles(company, role_title)").limit(1000),
    supabase.from("applications").select("stage").limit(1000),
    supabase.from("artifacts").select("id", { count: "exact", head: true }).eq("status", "approved"),
  ]);

  const rawProfile = mpRes.data?.data?.profile;
  const profile =
    rawProfile && typeof rawProfile === "object"
      ? profileSummary(parseCanonicalProfile(rawProfile, { defaultSource: "resume", at: "" }))
      : null;

  const { goal, plan } = goalRes;
  const matches = (matchAgg.data ?? []) as unknown as MatchRow[];
  const apps = appAgg.data ?? [];
  const stageCount = (s: string) => apps.filter((a) => a.stage === s).length;

  const topPursue: RoPursueRole[] = matches
    .filter((m) => m.recommendation === "pursue" && m.status !== "dismissed" && m.roles)
    .sort((a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1))
    .slice(0, 5)
    .map((m) => ({ id: m.role_id, company: m.roles!.company, title: m.roles!.role_title }));

  // M1 notebook recall — bounded top-k relevant notes. FAIL-SAFE: before the
  // migration is applied (no table/RPC), or on any recall error, RO simply has
  // no notes and every surface behaves exactly as in M0.
  let memory: RoNote[] = [];
  if (opts.recallQuery) {
    try {
      // M3 scope-aware recall: notes scoped to the surface the user is on (e.g.
      // the résumé command bar's `artifact:<id>` tune notes) get the in-scope
      // rank bonus, so RO answers with THAT artifact's context first.
      memory = await recallMemory(supabase, opts.recallQuery, 6, { scope: opts.recallScope });
    } catch (err) {
      logError("ro_memory.recall_failed", err);
    }
  }

  return {
    profile,
    goal: goal
      ? {
          target: goal.target?.archetype ?? null,
          deadline: goal.deadline_date ?? null,
          verdict: plan?.feasibility.verdict ?? null,
          weekly_apps_target: plan?.weekly.applications ?? null,
          best_lever: plan?.feasibility.bestLever ?? null,
        }
      : null,
    pipeline: {
      pursue_matches: matches.filter((m) => m.recommendation === "pursue" && m.status !== "dismissed").length,
      saved: matches.filter((m) => m.status === "saved" || m.status === "pursuing").length,
      applied: stageCount("applied"),
      interviewing: stageCount("screening") + stageCount("interviewing") + stageCount("onsite"),
      offers: stageCount("offer"),
      resumes_ready: readyAgg.count ?? 0,
    },
    topPursue,
    memory,
  };
}

/**
 * The state shape RO's dock/ask skills consume — the working context RO grounds
 * on. Pure; `top_pursue` stays the ONLY roles a tailor act may name (validateAct).
 */
export function toRoAskState(ctx: RoContext) {
  return {
    profile: ctx.profile,
    // What RO remembers about them (from past sessions), most relevant first.
    remembered: ctx.memory.map((n) => ({ note: n.text, kind: n.kind })),
    top_pursue: ctx.topPursue,
    goal: ctx.goal,
    pipeline: ctx.pipeline,
  };
}
