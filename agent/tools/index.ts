import { z } from "zod";
import { recallRolesMulti } from "@/lib/match";
import { supabaseService } from "@/lib/supabase/service";

/**
 * RO's tool registry. THE INVARIANT (architecture.md §6): there is NO send tool
 * here, and there can never be one. Sending is a separate user-clicked dispatch
 * route in app/api/dispatch — a different module the agent layer cannot import.
 *
 * tests/invariants/no-send-tool.test.ts asserts this registry contains no
 * send-capable tool; .dependency-cruiser.cjs fails the build if anything under
 * agent/ imports an outbound transport. Two independent guards.
 *
 * A tool = { name, description, schema, jsonSchema, run }. `run` is a pure
 * server function over the user's own data (RLS-scoped, or global/public role
 * data). Read/derive only — never outbound. The model calls these through the
 * tool loop in agent/registry.ts:callModel; args are validated with the zod
 * `schema` before `run` sees them (invalid args → a recoverable tool error).
 */

export interface ToolContext {
  userId: string;
}

/** JSON Schema (the shape the Anthropic tool API accepts as `input_schema`). */
export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface Tool<I = unknown, O = unknown> {
  name: string;
  description: string;
  /** zod schema — validates the model's arguments before `run` executes. */
  schema: z.ZodType<I>;
  /** JSON Schema handed to the Anthropic tool API as `input_schema`. */
  jsonSchema: JsonSchema;
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

/**
 * LIVE tools — DB-backed and wired into the model's tool loop. The rest are
 * declared placeholders (derive-only, phase 2) that are NOT handed to the model
 * yet, so it can never call an unimplemented body. runSkill (agent/skills/run.ts)
 * filters a skill's declared tools to this set before passing them to callModel.
 */
export const LIVE_TOOL_NAMES = ["get_master_profile", "get_role", "search_roles"] as const;
export type LiveToolName = (typeof LIVE_TOOL_NAMES)[number];

// ---------------------------------------------------------------------------
// Live, DB-backed tools
// ---------------------------------------------------------------------------

const getMasterProfileSchema = z.object({}).strict();

const getRoleSchema = z
  .object({
    id: z.string().min(1, "role id is required"),
  })
  .strict();

const searchRolesSchema = z
  .object({
    query: z.string().min(1, "query is required").max(4000),
    limit: z.number().int().min(1).max(24).optional(),
  })
  .strict();

const get_master_profile: Tool<z.infer<typeof getMasterProfileSchema>, unknown> = {
  name: "get_master_profile",
  description:
    "Read the current user's master_profile (their living source of truth: background, skills, evidence). Takes no arguments; scoped to the calling user.",
  schema: getMasterProfileSchema,
  jsonSchema: { type: "object", properties: {}, additionalProperties: false },
  run: async (_input, ctx) => {
    if (!ctx.userId) throw new Error("get_master_profile: no user in context");
    const db = supabaseService();
    const { data, error } = await db
      .from("master_profile")
      .select("data")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (error) throw new Error(`get_master_profile: ${error.message}`);
    if (!data) return { found: false as const, profile: null };
    return { found: true as const, profile: data.data ?? null };
  },
};

const get_role: Tool<z.infer<typeof getRoleSchema>, unknown> = {
  name: "get_role",
  description:
    "Read one role from the global roles corpus by its id. Returns company, title, archetype, must_haves, nice_to_haves, comp and url. Role data is global/public.",
  schema: getRoleSchema,
  jsonSchema: {
    type: "object",
    properties: { id: { type: "string", description: "The role id to fetch." } },
    required: ["id"],
    additionalProperties: false,
  },
  run: async (input, _ctx) => {
    const db = supabaseService();
    const { data, error } = await db
      .from("roles")
      .select("id, company, role_title, archetype, must_haves, nice_to_haves, comp, url")
      .eq("id", input.id)
      .maybeSingle();
    if (error) throw new Error(`get_role: ${error.message}`);
    if (!data) return { found: false as const, role: null };
    return { found: true as const, role: data };
  },
};

const search_roles: Tool<z.infer<typeof searchRolesSchema>, unknown> = {
  name: "search_roles",
  description:
    "Semantic + structured search over the global role corpus. Pass a natural-language query describing the kind of role; returns the nearest roles (best-first) with id, company, title, archetype and distance. Use before reasoning about specific roles.",
  schema: searchRolesSchema,
  jsonSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural-language description of the role(s) to find.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 24,
        description: "Max roles to return (default 8).",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  run: async (input, _ctx) => {
    const limit = input.limit ?? 8;
    const { candidates, poolSize } = await recallRolesMulti([input.query], limit);
    return {
      poolSize,
      count: candidates.length,
      roles: candidates.map((r) => ({
        id: r.id,
        company: r.company,
        role_title: r.role_title,
        archetype: r.archetype,
        distance: Number(r.distance.toFixed(4)),
      })),
    };
  },
};

// ---------------------------------------------------------------------------
// Placeholder (derive-only) tools — declared + allowlisted, not yet wired into
// the model loop. The shape + the invariant are what matter here.
// ---------------------------------------------------------------------------

const placeholder = (name: ToolName, description: string): Tool => ({
  name,
  description,
  schema: z.object({}).passthrough() as z.ZodType<unknown>,
  jsonSchema: { type: "object", properties: {}, additionalProperties: true },
  run: async (_input, _ctx) => ({ todo: "phase 2" }),
});

export const tools: Record<ToolName, Tool> = {
  get_master_profile: get_master_profile as Tool,
  get_role: get_role as Tool,
  search_roles: search_roles as Tool,
  score_fit: placeholder("score_fit", "Reason over a role's must_haves vs the master profile."),
  diff: placeholder("diff", "Diff two artifact versions (e.g. résumé variants)."),
  get_taste_model: placeholder(
    "get_taste_model",
    "Read the user's derived taste_model (confidence + provenance).",
  ),
};

/** Is this tool DB-backed and safe to hand to the model right now? */
export function isLiveTool(name: string): name is LiveToolName {
  return (LIVE_TOOL_NAMES as readonly string[]).includes(name);
}

/** The live Tool objects for a set of declared tool names (skips placeholders). */
export function liveTools(names: readonly string[]): Tool[] {
  const seen = new Set<string>();
  const out: Tool[] = [];
  for (const n of names) {
    if (isLiveTool(n) && !seen.has(n)) {
      seen.add(n);
      out.push(tools[n]);
    }
  }
  return out;
}
