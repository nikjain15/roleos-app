import { ToolRegistry } from "@/lib/conduit/mcp";
import { tools as agentTools } from "@/agent/tools";
import { roleosTools, type RoleOsMcpDeps, type SearchRolesResult } from "./roleos-tools";

/**
 * The RoleOS MCP server wiring: bind the read-only tools to the app's REAL data
 * access and expose them as a Conduit MCP `ToolRegistry`. The pure registry is
 * what the transports (stdio, HTTP/SSE) and the tests both consume.
 *
 * Authorization is a transport concern: `authorizeBearer` gates a hosted server
 * on a shared token. The tool data itself is global/public (role corpus), so it
 * carries no per-user scope; anything user-owned would stay off the MCP surface,
 * preserving the app's RLS boundary.
 */

/** Bind the RoleOS agent `search_roles` tool as the MCP data source. */
export function liveDeps(): RoleOsMcpDeps {
  return {
    searchRoles: async (args) => {
      // Global/public role data: the agent tool ignores per-user scope here.
      const out = await agentTools.search_roles.run(args, { userId: "" });
      return out as SearchRolesResult;
    },
  };
}

/** Server identity advertised on `initialize` and in `tools/list` metadata. */
export const ROLEOS_MCP_INFO = { name: "roleos", version: "0.1.0" } as const;

/** A ready-to-serve registry over the RoleOS read-only tools. */
export function createRoleOsRegistry(deps: RoleOsMcpDeps = liveDeps()): ToolRegistry {
  return new ToolRegistry(roleosTools(deps));
}

/**
 * Transport-level bearer check for the hosted server. Returns true when the
 * presented token matches `MCP_AUTH_TOKEN`. When no token is configured the
 * server is closed by default (returns false), so an unconfigured deploy never
 * serves unauthenticated. Local stdio needs no token (the OS process boundary
 * is the trust boundary).
 */
export function authorizeBearer(header: string | undefined, expected: string | undefined): boolean {
  if (!expected) return false;
  if (!header) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const presented = match?.[1]?.trim();
  return presented !== undefined && presented === expected;
}
