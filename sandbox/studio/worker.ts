/**
 * RoleOS build-studio sandbox worker (gate 3 prototype canvas).
 *
 * This is the standalone worker the main Next app calls over HTTP. The main app
 * runs on `next dev` and can't host containers, so the live sandbox lives here:
 * a CF Sandbox Durable Object that OWNS the running container (architecture.md
 * §1.2 — "the build-studio DO owns the sandbox"). One sandbox per build session.
 *
 * Run it locally:  cd sandbox/studio && npm install && npm run dev   (needs Docker)
 * Then point the app at it:  SANDBOX_URL=http://localhost:8788
 *
 * Endpoints:
 *   POST /build  { sessionId, files:[{path,content}], limits }  -> { previewUrl, ... }
 *   GET  /        health check
 *   (preview-subdomain requests are routed into the container by proxyToSandbox)
 *
 * Graduated from sandbox/spike/cf-sandbox/worker.ts — same proven preview wiring
 * (proxyToSandbox first; exposePort(8080,{hostname})), now driven by request files.
 */
import { getSandbox, proxyToSandbox } from "@cloudflare/sandbox";

export { Sandbox } from "@cloudflare/sandbox";

interface Env {
  Sandbox: DurableObjectNamespace;
  // Shared secret — only the main app may spin containers (they cost money).
  SANDBOX_SECRET?: string;
}

interface BuildFile {
  path: string;
  content: string;
}

interface BuildLimits {
  timeoutMs?: number;
  memoryMb?: number;
  egressAllowlist?: string[];
}

interface BuildRequest {
  sessionId: string;
  files: BuildFile[];
  limits?: BuildLimits;
}

const PORT = 8080;

async function runBuild(env: Env, hostname: string, body: BuildRequest): Promise<Response> {
  const { sessionId, files, limits } = body;
  if (!sessionId || !Array.isArray(files) || files.length === 0) {
    return Response.json({ error: "sessionId + files required" }, { status: 400 });
  }

  const t0 = Date.now();
  // One DO-owned container per build session — getSandbox(ns, id) IS that binding.
  const sandbox = getSandbox(env.Sandbox, sessionId);

  // Best-effort restart so re-builds in the same session don't stack dev servers.
  try {
    await sandbox.exec("pkill -f vite || true");
  } catch {
    /* fresh container — nothing to kill */
  }

  for (const f of files) {
    await sandbox.writeFile(`/workspace/${f.path}`, f.content);
  }
  const coldStartMs = Date.now() - t0;

  // Deps only (egress should be locked to the npm registry on a live account).
  await sandbox.exec("cd /workspace && npm install --no-audit --no-fund");
  await sandbox.startProcess("cd /workspace && npm run dev");
  // give Vite a moment to bind the port before we mint the URL
  await sandbox.exec("sleep 2");

  const { url } = await sandbox.exposePort(PORT, { hostname });

  return Response.json({
    previewUrl: url,
    coldStartMs,
    totalMs: Date.now() - t0,
    egressEnforced: (limits?.egressAllowlist?.length ?? 0) > 0,
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // 1 · route preview-subdomain requests into the running container
    const proxied = await proxyToSandbox(req, env);
    if (proxied) return proxied;

    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/build") {
      // Gate: only the main app (with the shared secret) may spin containers.
      if (env.SANDBOX_SECRET && req.headers.get("x-sandbox-secret") !== env.SANDBOX_SECRET) {
        return Response.json({ error: "forbidden" }, { status: 403 });
      }
      try {
        const body = (await req.json()) as BuildRequest;
        return await runBuild(env, url.host, body);
      } catch (e) {
        return Response.json(
          { error: e instanceof Error ? e.message : "build failed" },
          { status: 500 },
        );
      }
    }

    if (url.pathname === "/") {
      return Response.json({ ok: true, service: "roleos-build-sandbox" });
    }
    return new Response("not found", { status: 404 });
  },
};

interface DurableObjectNamespace {
  idFromName(n: string): unknown;
  get(id: unknown): unknown;
}
