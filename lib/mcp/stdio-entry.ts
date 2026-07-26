/**
 * Stdio entry for the RoleOS MCP server, for local clients (Claude Desktop, the
 * MCP inspector). Run with `npm run mcp:stdio`.
 *
 * This is a standalone script: the Next app never imports it, so it is not part
 * of the app bundle. It requires `@modelcontextprotocol/sdk` to be installed
 * (the vendored transport imports it at call time); the pure tool + registry
 * logic it serves is exercised by tests without the SDK. See docs/MCP.md.
 */
import { startStdioServer } from "@/lib/conduit/mcp";
import { liveDeps, ROLEOS_MCP_INFO } from "./roleos-server";
import { roleosTools } from "./roleos-tools";

async function main(): Promise<void> {
  await startStdioServer({
    name: ROLEOS_MCP_INFO.name,
    version: ROLEOS_MCP_INFO.version,
    tools: roleosTools(liveDeps()),
  });
  // Connected; the process now serves requests until the transport closes.
}

main().catch((err) => {
  console.error("roleos-mcp stdio server failed to start:", err);
  process.exit(1);
});
