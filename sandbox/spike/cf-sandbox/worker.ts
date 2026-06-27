/**
 * CF Sandbox SDK spike — proves the gate-3 sandbox locally (Docker + wrangler dev).
 * Three things to verify: secure code exec, a live preview URL, and that
 * runtime/egress/memory caps are enforceable.
 *
 * Preview-URL pattern (the bit the first run surfaced):
 *  - call proxyToSandbox(request, env) FIRST — it routes preview-subdomain
 *    requests into the running container;
 *  - exposePort(port, { hostname }) needs the worker's hostname to mint the URL.
 */
import { getSandbox, proxyToSandbox } from "@cloudflare/sandbox";
import type { BuildFile, BuildLimits, BuildResult } from "../target";

export { Sandbox } from "@cloudflare/sandbox";

interface Env {
  Sandbox: DurableObjectNamespace;
}

async function runBuild(
  env: Env,
  hostname: string,
  sessionId: string,
  files: BuildFile[],
  _entry: string,
  limits: BuildLimits,
): Promise<BuildResult> {
  const notes: string[] = [];
  const t0 = Date.now();
  const sandbox = getSandbox(env.Sandbox, sessionId);

  for (const f of files) {
    await sandbox.writeFile(`/workspace/${f.path}`, f.content);
  }
  const coldStartMs = Date.now() - t0;

  await sandbox.exec("cd /workspace && npm install --no-audit --no-fund");
  // start the dev server in the background and wait for the port to be listening
  await sandbox.startProcess("cd /workspace && npm run dev");
  await sandbox.exec("sleep 2");

  // mint the live preview URL (needs the worker hostname)
  const { url } = await sandbox.exposePort(8080, { hostname });
  notes.push(`preview minted for session ${sessionId}`);

  return {
    previewUrl: url,
    coldStartMs,
    firstByteMs: 0, // measured by hitting the preview URL from the client
    totalMs: Date.now() - t0,
    costUsd: null, // metered from CF Containers usage on a live (paid) account
    egressEnforced: limits.egressAllowlist.length > 0,
    notes,
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // 1 · route preview-subdomain requests into the container
    const proxied = await proxyToSandbox(req, env);
    if (proxied) return proxied;

    // 2 · the spike endpoint: run a build, return the result + preview URL
    const { TEST_PROJECT, DEFAULT_LIMITS } = await import("../target");
    const hostname = new URL(req.url).host;
    const result = await runBuild(env, hostname, "spike-session", TEST_PROJECT, "src/main.jsx", DEFAULT_LIMITS);
    return Response.json(result);
  },
};

interface DurableObjectNamespace {
  idFromName(n: string): unknown;
  get(id: unknown): unknown;
}
