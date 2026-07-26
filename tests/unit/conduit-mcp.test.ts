import { describe, it, expect } from "vitest";
import { buildMcpServer, type McpRequest, type McpServerLike } from "@/lib/conduit/mcp";
import { authorizeBearer, createRoleOsRegistry } from "@/lib/mcp/roleos-server";
import type { SearchRolesResult } from "@/lib/mcp/roleos-tools";

/**
 * End-to-end proof for the RoleOS MCP server: the registry lists the read-only
 * tool, a `tools/call` returns a valid CallToolResult, and bad arguments are
 * rejected by validation before the handler runs. Uses `buildMcpServer` with a
 * fake SDK server that just captures the two request handlers, so no MCP SDK and
 * no transport are needed.
 */

const LIST = Symbol("list");
const CALL = Symbol("call");

/** A fake SDK server that records handlers by the schema they were registered with. */
function fakeServer() {
  const handlers = new Map<unknown, (req: McpRequest) => Promise<unknown> | unknown>();
  const server: McpServerLike = {
    setRequestHandler(schema, handler) {
      handlers.set(schema, handler);
    },
  };
  return {
    server,
    list: () => handlers.get(LIST)!({} as McpRequest),
    call: (name: string, args: unknown) => handlers.get(CALL)!({ params: { name, arguments: args } }),
  };
}

const FAKE_ROLES: SearchRolesResult = {
  poolSize: 557,
  count: 1,
  roles: [{ id: "r1", company: "Acme", role_title: "Staff PM", archetype: "ai-pm", distance: 0.12 }],
};

function harness() {
  const registry = createRoleOsRegistry({ searchRoles: async () => FAKE_ROLES });
  const fake = fakeServer();
  buildMcpServer(fake.server, registry, { listSchema: LIST, callSchema: CALL });
  return fake;
}

describe("roleos mcp server · list + call", () => {
  it("lists the read-only search_roles tool with a typed schema", async () => {
    const { tools } = (await harness().list()) as {
      tools: Array<{ name: string; inputSchema: { required?: string[] } }>;
    };
    const names = tools.map((t) => t.name);
    expect(names).toEqual(["search_roles"]);
    expect(tools[0].inputSchema.required).toEqual(["query"]);
  });

  it("tools/call returns a valid, non-error result with structured content", async () => {
    const res = (await harness().call("search_roles", { query: "ai product roles", limit: 5 })) as {
      isError?: boolean;
      content: Array<{ type: string; text: string }>;
      structuredContent: SearchRolesResult;
    };
    expect(res.isError).toBeFalsy();
    expect(res.content[0].type).toBe("text");
    expect(res.structuredContent.roles[0].company).toBe("Acme");
    expect(JSON.parse(res.content[0].text)).toMatchObject({ count: 1 });
  });

  it("rejects invalid arguments before the handler runs", async () => {
    const res = (await harness().call("search_roles", { limit: 999 })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("invalid_arguments");
  });

  it("reports an unknown tool as an error result, never a throw", async () => {
    const res = (await harness().call("send_email", {})) as { isError?: boolean; content: Array<{ text: string }> };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("unknown_tool");
  });
});

describe("roleos mcp server · transport authorization", () => {
  it("accepts a matching bearer token and rejects everything else", () => {
    expect(authorizeBearer("Bearer secret-123", "secret-123")).toBe(true);
    expect(authorizeBearer("Bearer wrong", "secret-123")).toBe(false);
    expect(authorizeBearer(undefined, "secret-123")).toBe(false);
    // Closed by default: no configured token means no access.
    expect(authorizeBearer("Bearer secret-123", undefined)).toBe(false);
  });
});
