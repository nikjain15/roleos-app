/**
 * Explore thread → decision_events (personalization transfer). When an anon
 * visitor who chatted with RO on the Index later signs up, the questions they
 * asked — "which sponsor visas", "strongest fit for a senior PM", "which are
 * remote" — are real intent signals. We carry them into the taste model AT
 * first-auth (never before: pre-signup stays browser-only, privacy §3.2), the
 * same handoff pattern onboarding uses (lib/onboarding-events).
 *
 * A question is a mild-intent signal (weight 2) — above a passive view (1),
 * below an explicit correction (3). Pure + deterministic; deduped by question.
 */

export type ExploreTurnInput = { q: string; cited?: Array<{ id: string }> };

export type ExploreDecisionRow = {
  kind: string;
  subject_ref: string | null;
  action: "view";
  payload: Record<string, unknown>;
  weight: number;
};

const W = { question: 2 } as const;
const MAX_ROWS = 20;

/** Map the browser explore thread to append-only decision_events rows. */
export function exploreEvents(turns: ExploreTurnInput[]): ExploreDecisionRow[] {
  const rows: ExploreDecisionRow[] = [];
  const seen = new Set<string>();
  for (const t of turns ?? []) {
    const q = (t?.q ?? "").trim();
    if (!q) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue; // one signal per distinct question
    seen.add(key);
    rows.push({
      kind: "explore",
      subject_ref: null,
      action: "view",
      payload: {
        question: q.slice(0, 500),
        cited: (t.cited ?? []).map((c) => c.id).filter(Boolean).slice(0, 8),
      },
      weight: W.question,
    });
    if (rows.length >= MAX_ROWS) break;
  }
  return rows;
}
