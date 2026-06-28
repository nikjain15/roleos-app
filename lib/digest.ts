import { supabaseService } from "@/lib/supabase/service";
import { runSkill } from "@/agent/skills/run";
import digestSkill from "@/agent/skills/digest";
import { parseModelJson } from "@/lib/json";
import { logAgentRuns } from "@/lib/agent-runs";
import type { Cadence } from "@/lib/notifications";

/**
 * The ambient digest builder — the agent's brain. Gathers a user's real state,
 * has RO compose a digest (skill → quality gate), and stores it as a
 * notification. The cron scheduler calls buildAndStoreDigest for users who are
 * due (isDigestDue); the feed reads the latest stored digest. Self-quieting:
 * when a user goes quiet, the due interval stretches (RO goes quieter too).
 */

export interface DigestContent {
  title: string;
  did: string[];
  needs: string[];
  note?: string;
}

/** Base hours between digests per cadence. */
const CADENCE_HOURS: Record<Cadence, number> = {
  realtime: 6,
  daily: 24,
  weekly: 168,
  open: 24, // still build it; it just waits in-feed (never interrupts)
};

interface MatchRow {
  recommendation: string | null;
  status: string | null;
  roles: { company: string; role_title: string } | { company: string; role_title: string }[] | null;
}
interface ArtRow {
  type: string;
  status: string | null;
}

function roleLabel(r: MatchRow["roles"]): string {
  const x = Array.isArray(r) ? r[0] : r;
  return x ? `${x.company} — ${x.role_title}` : "a role";
}

/** Compact snapshot of what RO has done for the user — the digest's source. */
export async function buildDigestState(userId: string) {
  const db = supabaseService();
  const [{ data: matches }, { data: artifacts }] = await Promise.all([
    db.from("matches").select("recommendation, status, roles(company, role_title)").eq("user_id", userId),
    db.from("artifacts").select("type, status").eq("user_id", userId),
  ]);
  const m = (matches ?? []) as MatchRow[];
  const arts = (artifacts ?? []) as ArtRow[];
  const pursue = m.filter((x) => x.recommendation === "pursue");
  return {
    matches_total: m.length,
    pursue_count: pursue.length,
    top_pursue: pursue.slice(0, 3).map((x) => roleLabel(x.roles)),
    drafts_needing_your_eyes: arts.filter((a) => a.status === "needs_your_eyes").map((a) => a.type),
    drafts_ready_to_send: arts.filter((a) => a.status === "approved").length,
  };
}

/** Build a digest for one user and persist it. Returns null if there's nothing to say. */
export async function buildAndStoreDigest(userId: string): Promise<DigestContent | null> {
  const state = await buildDigestState(userId);
  if (state.matches_total === 0) return null; // nothing real to digest yet

  const { verdict } = await runSkill(digestSkill, { userId, data: { state } });
  await logAgentRuns(userId, verdict.runs, { skill: "digest", judge: verdict });
  const content = parseModelJson<DigestContent>(verdict.finalOutput);
  if (!content?.title || !Array.isArray(content.did)) return null;

  const db = supabaseService();
  await db.from("notifications").insert({
    user_id: userId,
    kind: "digest",
    tier: "digest",
    title: content.title,
    body: JSON.stringify({ did: content.did, needs: content.needs ?? [], note: content.note ?? "" }),
    payload: content,
    status: "unread",
  });
  await db
    .from("profiles")
    .update({ ambient: { last_digest_at: new Date().toISOString() } })
    .eq("id", userId);

  return content;
}

/**
 * Is a fresh digest due? Cadence sets the base interval; if the user has gone
 * quiet (no activity since the last digest), RO stretches the interval — quieter
 * when you're quiet (journey §10). A first-ever digest (no last_digest_at) is due.
 */
export function isDigestDue(
  cadence: Cadence,
  lastDigestAt: string | null,
  lastActivityAt: string | null,
  nowMs: number,
): boolean {
  if (!lastDigestAt) return true;
  const last = Date.parse(lastDigestAt);
  let intervalH = CADENCE_HOURS[cadence];
  // Self-quiet: no activity since the last digest → double the wait (cap 2×).
  const wentQuiet = !lastActivityAt || Date.parse(lastActivityAt) <= last;
  if (wentQuiet) intervalH *= 2;
  return nowMs - last >= intervalH * 3_600_000;
}
