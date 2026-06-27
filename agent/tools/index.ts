/**
 * RO's tool registry. THE INVARIANT (architecture.md §6): there is NO send tool
 * here, and there can never be one. Sending is a separate user-clicked dispatch
 * route in app/api/dispatch — a different module the agent layer cannot import.
 *
 * tests/invariants/no-send-tool.test.ts asserts this registry contains no
 * send-capable tool; .dependency-cruiser.cjs fails the build if anything under
 * agent/ imports an outbound transport. Two independent guards.
 *
 * A tool = { name, description, run }. run is a pure server function over the
 * user's own data (RLS-scoped). Read/derive only — never outbound.
 */

export interface ToolContext {
  userId: string;
}

export interface Tool<I = unknown, O = unknown> {
  name: string;
  description: string;
  /** Pure, server-side, read/derive-only. No network egress to third parties. */
  run: (input: I, ctx: ToolContext) => Promise<O>;
}

// The allowlist of tool names RO may ever use. Adding a name here is a
// deliberate, reviewable act. "send", "email", "dispatch", "http", "fetch",
// "post" and the like are FORBIDDEN by tests/invariants/no-send-tool.test.ts.
export const TOOL_NAMES = [
  "get_master_profile",
  "get_role",
  "search_roles",
  "score_fit",
  "diff",
  "get_taste_model",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

// Phase-1 placeholders. Real implementations (DB-backed, RLS-scoped) land with
// each gate in Phase 2+. The shape + the invariant are what matter now.
export const tools: Record<ToolName, Tool> = {
  get_master_profile: {
    name: "get_master_profile",
    description: "Read the user's master_profile (their living source of truth).",
    run: async (_input, _ctx) => ({ todo: "phase 2" }),
  },
  get_role: {
    name: "get_role",
    description: "Read one role from the global roles table by id.",
    run: async (_input, _ctx) => ({ todo: "phase 2" }),
  },
  search_roles: {
    name: "search_roles",
    description: "Vector + structured search over the 557 roles.",
    run: async (_input, _ctx) => ({ todo: "phase 2" }),
  },
  score_fit: {
    name: "score_fit",
    description: "Reason over a role's must_haves vs the master profile.",
    run: async (_input, _ctx) => ({ todo: "phase 2" }),
  },
  diff: {
    name: "diff",
    description: "Diff two artifact versions (e.g. résumé variants).",
    run: async (_input, _ctx) => ({ todo: "phase 2" }),
  },
  get_taste_model: {
    name: "get_taste_model",
    description: "Read the user's derived taste_model (confidence + provenance).",
    run: async (_input, _ctx) => ({ todo: "phase 2" }),
  },
};
