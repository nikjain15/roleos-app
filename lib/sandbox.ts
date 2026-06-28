/**
 * Sandbox runtime client (gate 3 prototype canvas). The main app runs on
 * `next dev` and CANNOT host containers, so the build sandbox lives in its own
 * worker (sandbox/studio — a CF Sandbox DO that owns the container, per
 * architecture.md §1.2). This module is the thin HTTP client the build route
 * uses to run a generated project and get back a live preview URL.
 *
 * Two-way-door: everything goes through the `SandboxRuntime` interface, so the
 * e2b fallback stays one file away (sandbox spike RECOMMENDATION.md).
 *
 * Graceful degradation is a feature, not an afterthought: when no sandbox is
 * configured (no SANDBOX_URL) or it's unreachable (Docker down, prod without CF
 * Containers), `build()` returns an `offline` result — the studio still shows the
 * generated code, the provenance bar, and the authenticity gate. The live preview
 * is the bonus when the sandbox is up, never a hard dependency.
 */
import { env } from "@/lib/env";

export interface ProjectFile {
  path: string;
  content: string;
}

export interface PrototypeGen {
  name?: string;
  summary?: string;
  entry?: string;
  walkthrough?: string[];
  files: ProjectFile[];
}

/**
 * Parse the delimited build_code output (@@META + @@FILE blocks). Raw code lives
 * between markers — no JSON escaping — so this is both token-cheap upstream and
 * robust to parse. Tolerant of a missing @@END or stray ``` fences. Returns null
 * if no files were produced.
 */
export function parsePrototypeOutput(text: string): PrototypeGen | null {
  let meta: { name?: string; summary?: string; entry?: string; walkthrough?: unknown } = {};
  const metaLine = text.match(/@@META[ \t]+(\{[\s\S]*?\})\s*(?:\r?\n|$)/);
  if (metaLine) {
    try {
      meta = JSON.parse(metaLine[1]);
    } catch {
      /* keep going — metadata is optional, files are what matter */
    }
  }

  const files: ProjectFile[] = [];
  const chunks = text.split(/^@@FILE[ \t]+/m).slice(1);
  for (const chunk of chunks) {
    const body = chunk.replace(/\r?\n?@@END[\s\S]*$/, ""); // drop trailing @@END
    const nl = body.indexOf("\n");
    if (nl === -1) continue;
    const path = body.slice(0, nl).trim();
    let content = body.slice(nl + 1);
    // strip an accidental ``` fence the model may wrap a file in
    content = content.replace(/^```[a-zA-Z0-9]*\r?\n/, "").replace(/\r?\n```\s*$/, "");
    if (path && content.trim().length > 0) files.push({ path, content });
  }
  if (files.length === 0) return null;
  return {
    name: meta.name,
    summary: meta.summary,
    entry: meta.entry,
    walkthrough: Array.isArray(meta.walkthrough) ? (meta.walkthrough as string[]) : [],
    files,
  };
}

export interface SandboxLimits {
  /** Hard wall-clock cap for the whole build session (ms). */
  timeoutMs: number;
  /** Memory cap (MB). */
  memoryMb: number;
  /** Deny-by-default egress; only these hosts may be reached (deps only). */
  egressAllowlist: string[];
}

/** Proportionate caps for a take-home build: deps from npm only, nothing else. */
export const DEFAULT_LIMITS: SandboxLimits = {
  timeoutMs: 90_000,
  memoryMb: 1024,
  egressAllowlist: ["registry.npmjs.org"],
};

export type SandboxStatus = "live" | "offline" | "error";

export interface SandboxResult {
  status: SandboxStatus;
  /** The live preview URL when status==='live'; null otherwise. */
  previewUrl: string | null;
  /** Plain-language note in RO's voice for the UI. */
  note: string;
  coldStartMs?: number;
  totalMs?: number;
}

export interface SandboxRuntime {
  readonly name: string;
  build(sessionId: string, files: ProjectFile[], limits?: SandboxLimits): Promise<SandboxResult>;
}

// The sandbox contract the generated project MUST satisfy to be servable.
const DEV_SCRIPT = "vite --host 0.0.0.0 --port 8080";
const DEFAULT_VITE_CONFIG = "import react from '@vitejs/plugin-react';\nexport default { plugins: [react()] };\n";
const DEFAULT_INDEX_HTML =
  '<!doctype html>\n<html>\n  <head><meta charset="utf-8" /><title>Prototype</title></head>\n' +
  '  <body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>\n</html>\n';

interface Pkg {
  name?: string;
  private?: boolean;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [k: string]: unknown;
}

/**
 * Make the generated project runnable regardless of small model slips: force the
 * exact dev script + port the sandbox exposes, guarantee the core deps, and
 * backfill a vite config / index.html if missing. Defensive, not creative — it
 * never adds app code, only the harness the sandbox needs.
 */
export function normalizeProject(files: ProjectFile[]): ProjectFile[] {
  const out = files.map((f) => ({ ...f }));
  const byPath = (p: string) => out.find((f) => f.path === p);

  // package.json — force dev script + ensure the four allowed deps exist.
  const pkgFile = byPath("package.json");
  let pkg: Pkg = {};
  if (pkgFile) {
    try {
      pkg = JSON.parse(pkgFile.content) as Pkg;
    } catch {
      pkg = {};
    }
  }
  pkg.name ??= "roleos-prototype";
  pkg.private = true;
  pkg.scripts = { ...(pkg.scripts ?? {}), dev: DEV_SCRIPT };
  pkg.dependencies = {
    react: "^19.0.0",
    "react-dom": "^19.0.0",
    ...(pkg.dependencies ?? {}),
  };
  pkg.devDependencies = {
    vite: "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    ...(pkg.devDependencies ?? {}),
  };
  const pkgContent = JSON.stringify(pkg, null, 2);
  if (pkgFile) pkgFile.content = pkgContent;
  else out.unshift({ path: "package.json", content: pkgContent });

  if (!byPath("vite.config.js") && !byPath("vite.config.ts")) {
    out.push({ path: "vite.config.js", content: DEFAULT_VITE_CONFIG });
  }
  if (!byPath("index.html")) {
    out.push({ path: "index.html", content: DEFAULT_INDEX_HTML });
  }
  return out;
}

function sandboxBaseUrl(): string | null {
  const url = (env() as unknown as { SANDBOX_URL?: string }).SANDBOX_URL;
  return url && url.trim() ? url.replace(/\/+$/, "") : null;
}

/**
 * CF Sandbox SDK runtime — calls the standalone sandbox worker over HTTP. The
 * worker writes the files, runs npm install + the dev server in a DO-owned
 * container, and mints a preview URL (sandbox/studio/worker.ts).
 */
export const cfSandboxRuntime: SandboxRuntime = {
  name: "cf-sandbox",
  async build(sessionId, files, limits = DEFAULT_LIMITS): Promise<SandboxResult> {
    const base = sandboxBaseUrl();
    if (!base) {
      return {
        status: "offline",
        previewUrl: null,
        note: "Live preview's off right now — no sandbox connected. Your prototype's built and the code's all here; flip the sandbox on to run it.",
      };
    }
    const project = normalizeProject(files);
    const secret = (env() as unknown as { SANDBOX_SECRET?: string }).SANDBOX_SECRET;
    try {
      const res = await fetch(`${base}/build`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "x-sandbox-secret": secret } : {}),
        },
        body: JSON.stringify({ sessionId, files: project, limits }),
        signal: AbortSignal.timeout(limits.timeoutMs + 30_000),
      });
      if (!res.ok) {
        return {
          status: "error",
          previewUrl: null,
          note: `The sandbox couldn't build it (${res.status}). The code's still here — I'll keep the preview off for now.`,
        };
      }
      const j = (await res.json()) as { previewUrl?: string; coldStartMs?: number; totalMs?: number };
      if (!j.previewUrl) {
        return {
          status: "error",
          previewUrl: null,
          note: "The sandbox built it but didn't return a preview URL. The code's here; preview's off.",
        };
      }
      return {
        status: "live",
        previewUrl: j.previewUrl,
        note: "It's running — live preview's on the canvas.",
        coldStartMs: j.coldStartMs,
        totalMs: j.totalMs,
      };
    } catch {
      return {
        status: "offline",
        previewUrl: null,
        note: "Couldn't reach the sandbox — it may be asleep. Your code's built and saved; preview's off for now.",
      };
    }
  },
};
