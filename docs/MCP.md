# RoleOS MCP server

RoleOS exposes its read-only capabilities over the Model Context Protocol using
the vendored `@conduit/mcp` package (`lib/conduit/mcp`, copied from
github.com/nikjain15/conduit; see `lib/conduit/VENDOR.md`). MCP clients such as
Claude Desktop or the MCP inspector can discover and call these tools.

## What is exposed

| Tool           | Access     | Description |
| -------------- | ---------- | ----------- |
| `search_roles` | read-only  | Semantic search over the global/public role corpus. Returns the nearest roles (best-first) with id, company, title, archetype and distance. |

The MCP surface inherits RoleOS's core invariant: it is read-only. There is no
send or dispatch tool, and only tools over global/public data are exposed. Any
user-owned data stays behind Row Level Security and off the MCP surface, so the
app's auth boundary is preserved. Argument shapes are typed JSON Schema and are
validated by the registry before any handler runs (`lib/mcp/roleos-tools.ts`).

## Architecture

- `lib/mcp/roleos-tools.ts`: the tool set as pure `ConduitTool`s. Data access is
  injected, so the tools carry no DB or embeddings coupling.
- `lib/mcp/roleos-server.ts`: binds the tools to the app's real `search_roles`
  agent tool and builds a `ToolRegistry`. Also holds `authorizeBearer`, the
  transport-level token check.
- `lib/mcp/stdio-entry.ts`: the stdio entry point.

## Running locally (stdio)

```bash
npm run mcp:stdio
```

The stdio and HTTP/SSE transports import `@modelcontextprotocol/sdk` at call
time. Install it before running a live transport:

```bash
npm i -D @modelcontextprotocol/sdk
```

The pure tool + registry logic (what `tools/list` and `tools/call` actually do)
needs no SDK and is covered by `tests/unit/conduit-mcp.test.ts`.

Example Claude Desktop config entry:

```json
{
  "mcpServers": {
    "roleos": {
      "command": "npx",
      "args": ["tsx", "lib/mcp/stdio-entry.ts"]
    }
  }
}
```

## Status (honest)

Today the MCP surface runs over **stdio only**. The pure tool + registry logic
and the stdio entry point are wired and tested; the HTTP/SSE transport is
documented as a URL *shape* below but is **not yet mounted in an app route**
(there is no `app/**` route that binds `createSseHandler`), so `mcp.roleos.fyi`
describes the intended contract, not a live endpoint. The MCP SDK
(`@modelcontextprotocol/sdk`) is an **optional dependency**: it is not in
`package.json` and is imported only at call time by a live transport, so install
it before running one (see below). The stdio and (future) HTTP paths share the
same SDK-free tool + registry core.

## Hosted URL shape (HTTP/SSE)

The vendored `createSseHandler` (`lib/conduit/mcp` → `http.ts`) implements the
two-endpoint MCP SSE transport. Once mounted, a hosted deployment would map two
routes onto it:

- `GET  https://mcp.roleos.fyi/sse` opens the long-lived event stream and, on
  connect, advertises the POST endpoint below (correlated by `sessionId`).
- `POST https://mcp.roleos.fyi/messages?sessionId=<id>` carries client messages
  back into the open session.

Both routes require an `Authorization: Bearer <token>` header, checked with
`authorizeBearer` against the `MCP_AUTH_TOKEN` secret. The server is closed by
default: if `MCP_AUTH_TOKEN` is unset, every request is rejected, so an
unconfigured deployment never serves unauthenticated traffic.
