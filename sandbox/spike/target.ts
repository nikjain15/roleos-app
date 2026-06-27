/**
 * The shared spike target — both CF Sandbox SDK and e2b implement this exact
 * interface so the comparison is apples-to-apples (architecture.md §10).
 */

export interface BuildFile {
  path: string;
  content: string;
}

export interface BuildLimits {
  /** Hard wall-clock cap for the whole build session (ms). */
  timeoutMs: number;
  /** Deny-by-default egress; only these hosts may be reached. */
  egressAllowlist: string[];
  /** Memory cap (MB). */
  memoryMb: number;
}

export interface BuildResult {
  previewUrl: string;
  coldStartMs: number;
  firstByteMs: number;
  totalMs: number;
  costUsd: number | null; // null until metered against a live account
  egressEnforced: boolean;
  notes: string[];
}

/** Both runtimes implement this. */
export interface SandboxRuntime {
  readonly name: "cf-sandbox" | "e2b";
  runBuild(files: BuildFile[], entry: string, limits: BuildLimits): Promise<BuildResult>;
  teardown(): Promise<void>;
}

/** The untrusted project we build in both — a minimal Vite React app. */
export const TEST_PROJECT: BuildFile[] = [
  {
    path: "package.json",
    content: JSON.stringify(
      {
        name: "spike-app",
        private: true,
        scripts: { dev: "vite --host --port 8080" },
        dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
        devDependencies: { vite: "^6.0.0", "@vitejs/plugin-react": "^4.3.0" },
      },
      null,
      2,
    ),
  },
  {
    path: "index.html",
    content:
      '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
  },
  {
    path: "src/main.jsx",
    content:
      "import {createRoot} from 'react-dom/client';createRoot(document.getElementById('root')).render('RoleOS sandbox spike OK');",
  },
  {
    path: "vite.config.js",
    content:
      "import react from '@vitejs/plugin-react';export default {plugins:[react()]};",
  },
];

export const DEFAULT_LIMITS: BuildLimits = {
  timeoutMs: 60_000,
  egressAllowlist: ["registry.npmjs.org"], // deps only; nothing else
  memoryMb: 1024,
};

export interface ScoredRuntime {
  name: string;
  result: BuildResult;
  weightedScore: number;
}

/** Rubric weights (architecture.md §10). Scores are filled from live runs. */
export const RUBRIC = {
  isolation: 3,
  previewLatency: 2,
  egressControl: 3,
  cost: 2,
  cfFit: 2,
} as const;
