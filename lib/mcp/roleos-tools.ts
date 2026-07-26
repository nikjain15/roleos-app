import type { ConduitTool, JsonSchema, ToolResult } from "@/lib/conduit/mcp";

/**
 * RoleOS MCP tools, built on the vendored `@conduit/mcp` tool model.
 *
 * READ-ONLY only. The single non-negotiable RoleOS invariant (architecture.md
 * §6) is that the agent surface has no outbound/send capability; the MCP surface
 * inherits it: every tool here reads or derives, and the tool NAMES mirror the
 * app's own allowlist (agent/tools). Argument shapes are typed JSON Schema and
 * are validated by the registry before a handler ever runs.
 *
 * The data access is injected (`RoleOsMcpDeps`) rather than imported, so this
 * module stays free of DB/embeddings coupling and is trivially testable: the
 * real stdio/HTTP entry binds the live `search_roles`, tests bind a fake.
 */

/** One search hit as returned to an MCP client. */
export interface RoleHit {
  id: string;
  company: string;
  role_title: string;
  archetype: string | null;
  distance: number;
}

export interface SearchRolesResult {
  poolSize: number;
  count: number;
  roles: RoleHit[];
}

export interface SearchRolesArgs {
  query: string;
  limit?: number;
}

export interface RoleOsMcpDeps {
  /**
   * Read-only role search over the global/public corpus. Mirrors the app's
   * `search_roles` agent tool (semantic recall). Must honour the app's own
   * access rules: role data is global/public, so no per-user scope is required;
   * transport-level authorization is enforced by the server entry, not here.
   */
  searchRoles: (args: SearchRolesArgs) => Promise<SearchRolesResult>;
}

const searchRolesSchema: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      minLength: 1,
      maxLength: 4000,
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
};

/** Build the RoleOS MCP tool set from injected, read-only data access. */
export function roleosTools(deps: RoleOsMcpDeps): ConduitTool[] {
  const searchRoles: ConduitTool<SearchRolesArgs> = {
    name: "search_roles",
    description:
      "Semantic search over the global RoleOS role corpus. Pass a natural-language query describing the kind of role; returns the nearest roles (best-first) with id, company, title, archetype and distance. Read-only over global/public role data.",
    inputSchema: searchRolesSchema,
    handler: async (args): Promise<ToolResult> => {
      const result = await deps.searchRoles({
        query: args.query,
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  };

  // The registry stores tools with the default arg type; the handler validated
  // its own typed args above, so narrow back to the registry's tool type.
  return [searchRoles as unknown as ConduitTool];
}
