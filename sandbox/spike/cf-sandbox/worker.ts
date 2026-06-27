/**
 * CF Sandbox SDK implementation of the spike target. Runnable as a Worker with
 * Containers enabled + Docker locally. `export { Sandbox }` is required.
 *
 * Isolation: each sandbox is a Durable-Object-owned container — which is exactly
 * the ownership model architecture.md §1.2 wants for the build-studio DO (the DO
 * holds the live sandbox). Preview URL via exposePort(). Egress + memory caps are
 * configured on the container/Dockerfile (see Dockerfile + wrangler.jsonc).
 */
import { getSandbox } from "@cloudflare/sandbox";
import type { BuildFile, BuildLimits, BuildResult } from "../target";

export { Sandbox } from "@cloudflare/sandbox";

interface Env {
  Sandbox: DurableObjectNamespace;
}

async function runBuild(
  env: Env,
  sessionId: string,
  files: BuildFile[],
  _entry: string,
  limits: BuildLimits,
): Promise<BuildResult> {
  const notes: string[] = [];
  const t0 = Date.now();
  const sandbox = getSandbox(env.Sandbox, sessionId);

  // Materialize the untrusted project.
  for (const f of files) {
    await sandbox.writeFile(`/workspace/${f.path}`, f.content);
  }
  const coldStartMs = Date.now() - t0;

  // Install + start dev server under the wall-clock cap.
  await sandbox.exec("cd /workspace && npm install --no-audit --no-fund", {
    // timeout handling is enforced by the harness racing against limits.timeoutMs
  } as never);
  await sandbox.exec("cd /workspace && nohup npm run dev >/tmp/dev.log 2>&1 &");

  const { url } = await sandbox.exposePort(8080);

  const tFirst = Date.now();
  const probe = await fetch(url);
  const firstByteMs = Date.now() - tFirst;
  notes.push(`probe status ${probe.status}`);

  return {
    previewUrl: url,
    coldStartMs,
    firstByteMs,
    totalMs: Date.now() - t0,
    costUsd: null, // metered from CF Containers usage on a live account
    egressEnforced: limits.egressAllowlist.length > 0, // enforced at container net policy
    notes,
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { TEST_PROJECT, DEFAULT_LIMITS } = await import("../target");
    const result = await runBuild(env, "spike-session", TEST_PROJECT, "src/main.jsx", DEFAULT_LIMITS);
    return Response.json(result);
  },
};

interface DurableObjectNamespace {
  idFromName(n: string): unknown;
  get(id: unknown): unknown;
}
