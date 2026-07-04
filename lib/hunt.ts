import type { SupabaseClient } from "@supabase/supabase-js";
import { recomputeMatchesForUser } from "@/lib/recompute-matches";
import { runSkill } from "@/agent/skills/run";
import draftResume from "@/agent/skills/draft_resume";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";
import { deriveNextAction } from "@/lib/tracker";
import { logInfo, logWarn, errorFields } from "@/lib/log";

/**
 * Overnight autonomous hunt (slice X1, docs/specs/x1-overnight-hunt.md). While
 * the user sleeps, RO re-matches them against the live corpus, pre-drafts
 * truth-gated résumés for their best FRESH pursue matches, and queues each in
 * the Tracker — `ready` when the gate passed, `drafting` when it flagged. No
 * send: the queue ends at a human's "Send it" click, always.
 *
 * Pure pieces (eligibility, selection, copy) are exported for unit tests; the
 * orchestrator takes a service-role client and is driven by /api/cron/hunt.
 */

/** Hunt at most once per user per 20h — nightly with slack for cron drift. */
export const HUNT_INTERVAL_MS = 20 * 3_600_000;
/** Pre-draft at most this many résumés per user per night. */
export const HUNT_DRAFTS_PER_USER = 2;
/** Skip users with no decision_events in this window — no spend, no noise. */
export const HUNT_DORMANT_DAYS = 30;

export interface HuntAmbient {
  last_hunt_at?: string;
  hunt_paused?: boolean;
}

/** Is this user due a hunt? Paused wins; then the 20h throttle. */
export function isHuntDue(ambient: HuntAmbient | null | undefined, nowMs: number): boolean {
  if (ambient?.hunt_paused) return false;
  const last = ambient?.last_hunt_at ? Date.parse(ambient.last_hunt_at) : NaN;
  if (Number.isFinite(last) && nowMs - last < HUNT_INTERVAL_MS) return false;
  return true;
}

/** Walked away? (No decisions in HUNT_DORMANT_DAYS — RO stays quiet and spends nothing.) */
export function isDormant(lastEventAt: string | null | undefined, nowMs: number): boolean {
  if (!lastEventAt) return true; // never acted → nothing to hunt against yet
  const last = Date.parse(lastEventAt);
  return !Number.isFinite(last) || nowMs - last > HUNT_DORMANT_DAYS * 86_400_000;
}

export interface HuntableMatch {
  role_id: string;
  fit_score: number | null;
  recommendation: string | null;
  status: string | null;
}

/**
 * Pick the night's draft targets: FRESH pursue-grade matches (status 'new' —
 * the user hasn't touched them), best fit first, excluding roles already
 * tracked or already holding a résumé artifact. Pure; capped.
 */
export function selectHuntTargets(
  matches: HuntableMatch[],
  excludedRoleIds: ReadonlySet<string>,
  cap: number = HUNT_DRAFTS_PER_USER,
): string[] {
  return matches
    .filter(
      (m) =>
        m.role_id &&
        m.recommendation === "pursue" &&
        m.status === "new" &&
        !excludedRoleIds.has(m.role_id),
    )
    .sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0))
    .slice(0, Math.max(0, cap))
    .map((m) => m.role_id);
}

export interface HuntDraft {
  company: string;
  role_title: string;
  ready: boolean; // gate passed → Tracker 'ready'; flagged → 'drafting'
}

/** Notification copy — honest about what happened, calm, zero urgency theater. */
export function huntSummary(drafts: HuntDraft[]): { title: string; body: string } {
  const ready = drafts.filter((d) => d.ready).length;
  const flagged = drafts.length - ready;
  const names = drafts.map((d) => `${d.role_title} at ${d.company}`).join(" · ");
  const title =
    drafts.length === 1
      ? `Overnight: I drafted a résumé for ${drafts[0].role_title} at ${drafts[0].company}`
      : `Overnight: I drafted ${drafts.length} résumés for fresh matches`;
  const parts: string[] = [names];
  if (ready) parts.push(`${ready} ${ready === 1 ? "is" : "are"} in your Ready queue — review and send when you're ready.`);
  if (flagged) parts.push(`${flagged} need${flagged === 1 ? "s" : ""} your eyes first — I flagged what to check.`);
  parts.push("Nothing goes out without you.");
  return { title, body: parts.join(" ") };
}

export interface HuntUserResult {
  recomputed: { saved: number; pursue: number };
  drafts: HuntDraft[];
  errors: number;
}

/**
 * Run one user's overnight hunt with a SERVICE-ROLE client. Re-match → select
 * fresh targets → draft through the full quality gate (truth gate included,
 * every call metered) → queue in the Tracker. Throws only when the user has no
 * usable profile (caller logs + skips); per-draft failures are contained.
 */
export async function huntForUser(
  db: SupabaseClient,
  userId: string,
  draftCap: number = HUNT_DRAFTS_PER_USER,
): Promise<HuntUserResult> {
  // 1 · fresh, goal-aimed matches (preserves every user decision). A recall
  // hiccup (embedding outage etc.) must not kill the night — fall back to the
  // matches already on file and still draft.
  let recomputed = { saved: 0, pursue: 0 };
  try {
    const r = await recomputeMatchesForUser(db, userId);
    recomputed = { saved: r.saved, pursue: r.pursue };
  } catch (err) {
    logWarn("hunt.recompute_failed", { user_id: userId, ...errorFields(err) });
  }

  // The drafts ground in the same source of truth the tailor path uses.
  const { data: mp } = await db.from("master_profile").select("data").eq("user_id", userId).single();
  const profileRaw = (mp?.data as { raw?: string } | null)?.raw;
  if (!profileRaw || profileRaw.trim().length < 30) throw new Error("no usable master_profile");

  // 2 · select targets: fresh pursues minus tracked roles / roles with a résumé.
  const [{ data: matches }, { data: apps }, { data: arts }] = await Promise.all([
    db
      .from("matches")
      .select("role_id, fit_score, recommendation, status")
      .eq("user_id", userId)
      .eq("recommendation", "pursue")
      .eq("status", "new")
      .order("fit_score", { ascending: false })
      .limit(50)
      .returns<HuntableMatch[]>(),
    db.from("applications").select("role_id").eq("user_id", userId).limit(500),
    db.from("artifacts").select("role_id").eq("user_id", userId).eq("type", "resume").limit(500),
  ]);
  const excluded = new Set<string>(
    [...(apps ?? []), ...(arts ?? [])].map((r) => (r as { role_id: string | null }).role_id ?? ""),
  );
  const targets = selectHuntTargets(matches ?? [], excluded, draftCap);

  const drafts: HuntDraft[] = [];
  let errors = 0;

  for (const roleId of targets) {
    try {
      const { data: role } = await db
        .from("roles")
        .select("id, company, role_title, must_haves, keywords")
        .eq("id", roleId)
        .single();
      if (!role) continue;

      // 3 · full quality gate — identical path to /api/tailor, identical bar.
      const { verdict } = await runSkill(draftResume, {
        userId,
        data: { role, profile: profileRaw, groundTruth: profileRaw },
      });
      await logAgentRuns(userId, verdict.runs, { skill: "draft_resume", judge: verdict });

      const passed = verdict.status === "passed";
      const { data: artifact, error: aErr } = await db
        .from("artifacts")
        .insert({
          user_id: userId,
          role_id: roleId,
          type: "resume",
          content: parseModelJson(verdict.finalOutput) ?? {},
          provenance: {
            gate_status: verdict.status,
            truth: verdict.truth,
            critic: verdict.critic,
            source: "overnight_hunt",
          },
          status: passed ? "draft" : "needs_your_eyes",
        })
        .select("id")
        .single();
      if (aErr || !artifact) throw new Error(`artifact insert: ${aErr?.message ?? "no row"}`);

      // 4 · queue it in the Tracker. Gate-passed → 'ready'; flagged → 'drafting'.
      const stage = passed ? "ready" : "drafting";
      const now = new Date().toISOString();
      const { data: app, error: appErr } = await db
        .from("applications")
        .insert({
          user_id: userId,
          role_id: roleId,
          stage,
          stage_history: [{ stage, at: now }],
          artifact_ids: [artifact.id],
          next_action: deriveNextAction(stage, { enteredAt: now, hasApprovedResume: false }),
          sent_at: null,
          updated_at: now,
        })
        .select("id")
        .single();
      // 23505 = the user (or a racing run) already tracks this role — fine, keep the artifact.
      if (appErr && appErr.code !== "23505") throw new Error(`application insert: ${appErr.message}`);

      await db.from("decision_events").insert({
        user_id: userId,
        kind: "hunt",
        subject_ref: (app as { id: string } | null)?.id ?? null,
        action: "edit",
        payload: { role_id: roleId, stage, artifact_id: artifact.id, gate: verdict.status },
        weight: 1,
      });

      drafts.push({
        company: String(role.company ?? ""),
        role_title: String(role.role_title ?? ""),
        ready: passed,
      });
      logInfo("hunt.draft", { user_id: userId, role_id: roleId, stage, gate: verdict.status });
    } catch (err) {
      errors++;
      logWarn("hunt.draft_failed", { user_id: userId, role_id: roleId, ...errorFields(err) });
    }
  }

  return { recomputed, drafts, errors };
}
