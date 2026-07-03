/**
 * Suggested follow-up questions for Explore Ask (Slice 6). Deterministic — these
 * are *prompts the user can click*, not model-asserted facts, so they never risk
 * inventing anything (the grounded answer still comes from `index_qa`). Pure +
 * tested; contextual to the page scope and whether RO cited any roles.
 */
export interface AskScope {
  company?: string;
  archetype?: string;
}

const GENERIC = [
  "Which of these is the strongest fit for a senior PM?",
  "Which roles sponsor visas?",
  "What do they pay, where it's stated?",
  "Which are remote?",
  "What must-haves keep coming up?",
];

export function suggestFollowups(
  scope: AskScope | undefined,
  hasRoles: boolean,
  asked: string[] = [],
): string[] {
  const askedSet = new Set(asked.map((a) => a.trim().toLowerCase()));
  const pool: string[] = [];

  if (scope?.company) {
    pool.push(
      `What seniority are the ${scope.company} roles?`,
      `What does ${scope.company} look for most?`,
    );
  }
  if (scope?.archetype) {
    pool.push(`Which ${scope.archetype} roles are the best bets?`);
  }
  if (hasRoles) pool.push(...GENERIC);

  const out: string[] = [];
  for (const q of pool) {
    if (out.length >= 3) break;
    if (askedSet.has(q.trim().toLowerCase())) continue;
    if (out.includes(q)) continue;
    out.push(q);
  }
  return out;
}
