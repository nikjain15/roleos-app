import { recallRoles, type CandidateRole } from "@/lib/match";
import { runSkill } from "@/agent/skills/run";
import matchSkill, { stripFence } from "@/agent/skills/match";

/**
 * Full matching: pgvector recall → Claude reasoning (the `match` skill, through
 * the quality gate) → merged result the feed/onboarding render. RO's recommendation
 * + why + gaps per role, calibrated to the confidence ladder.
 */
export interface MatchedRole extends CandidateRole {
  fit: number;
  recommendation: "pursue" | "maybe" | "skip";
  why: string;
  gaps: Array<{ gap: string; bridgeable: "yes" | "maybe" | "no" }>;
}

export async function matchProfile(
  profileText: string,
  count = 6,
): Promise<{ matches: MatchedRole[]; scanned: number; gatePassed: boolean }> {
  const candidates = await recallRoles(profileText, count);

  const { verdict } = await runSkill(matchSkill, {
    userId: "anon",
    data: { profile: profileText, roles: candidates },
  });

  let reasoned: Array<Record<string, unknown>> = [];
  try {
    reasoned = JSON.parse(stripFence(verdict.finalOutput));
  } catch {
    reasoned = [];
  }
  const byId = new Map(reasoned.map((m) => [m.id, m]));

  const matches: MatchedRole[] = candidates.map((c) => {
    const m = byId.get(c.id) ?? {};
    return {
      ...c,
      fit: typeof m.fit === "number" ? m.fit : Math.round((1 - c.distance) * 100),
      recommendation: (m.recommendation as MatchedRole["recommendation"]) ?? "maybe",
      why: (m.why as string) ?? "",
      gaps: (m.gaps as MatchedRole["gaps"]) ?? [],
    };
  });

  // sort by RO's fit, pursue first
  matches.sort((a, b) => b.fit - a.fit);
  return { matches, scanned: 557, gatePassed: verdict.status === "passed" };
}
