/**
 * Build studio (gate 3) — session shape, provenance, and the ENFORCED
 * authenticity gate (journey.html §7). The studio will not let a 100%-RO
 * artifact be submitted: the human's edge must anchor it.
 */

export type Provenance = "ro" | "you";

export interface BuildSection {
  id: string;
  title: string;
  body: string;
  provenance: Provenance;
}

export type CanvasType = "prd" | "case_study" | "prototype";

/** A runnable prototype (the prototype canvas) — generated code + a live preview. */
export interface PrototypeArtifact {
  name?: string;
  summary?: string;
  entry?: string;
  files: { path: string; content: string }[];
  walkthrough?: string[];
  /** Live preview URL when the sandbox is up; null in graceful offline mode. */
  preview_url: string | null;
  sandbox_status: "live" | "offline" | "error";
  sandbox_note: string;
  built_at?: string;
}

export interface BuildContent {
  canvas_type: CanvasType;
  brief: string;
  phase: number; // 1..8
  decode?: unknown;
  angles?: unknown[];
  bet?: unknown;
  sections: BuildSection[];
  edge?: { question?: string; why?: string; answer?: string; weaved?: boolean };
  pressure?: { attacks?: unknown[]; verdict?: string; note?: string };
  /** Prototype canvas only — the runnable artifact built in the sandbox. */
  prototype?: PrototypeArtifact;
}

/** Char-length-weighted: what share of the artifact is the human's own thinking. */
export function provenanceSplit(sections: BuildSection[]): { your_pct: number; ro_pct: number } {
  const len = (s: BuildSection) => s.body.trim().length;
  const total = sections.reduce((a, s) => a + len(s), 0) || 1;
  const yours = sections.filter((s) => s.provenance === "you").reduce((a, s) => a + len(s), 0);
  const your_pct = Math.round((yours / total) * 100);
  return { your_pct, ro_pct: 100 - your_pct };
}

/** A prototype is genuinely built only if it has real app source (a src/ file),
 *  not merely the generated harness (package.json / vite config / index.html). */
export function hasPrototypeSource(p?: PrototypeArtifact): boolean {
  return !!p?.files?.some((f) => f.path.startsWith("src/") && f.content.trim().length > 0);
}

export interface GateCheck {
  name: string;
  pass: boolean;
  detail: string;
}

/** Minimum share of the artifact that must be the human's own thinking. */
export const PROVENANCE_THRESHOLD = 20;

/**
 * The submit-readiness gate (enforced). All three must pass before submit
 * unlocks. This is the authenticity gate — structurally impossible to ship a
 * 100%-RO artifact.
 */
export function authenticityGate(content: BuildContent): { ok: boolean; checks: GateCheck[] } {
  const { your_pct } = provenanceSplit(content.sections);
  const hasEdge = content.sections.some((s) => s.provenance === "you") && !!content.edge?.weaved;
  const pressured = !!content.pressure?.verdict;
  const qualityOk = pressured && content.pressure!.verdict !== "would_fail";

  const checks: GateCheck[] = [];

  // Prototype canvas only: there has to BE a real, built prototype to ship —
  // an actual source file, not just the generated harness (package.json etc.).
  if (content.canvas_type === "prototype") {
    const built = hasPrototypeSource(content.prototype);
    checks.push({
      name: "Prototype built",
      pass: built,
      detail: built
        ? content.prototype!.preview_url
          ? "It's built and running in the sandbox."
          : "It's built — the code's all here (live preview's off, that's fine)."
        : "Build the prototype first — there's nothing to ship yet.",
    });
  }

  checks.push(
    {
      name: "Quality vs rubric",
      pass: qualityOk,
      detail: pressured
        ? content.pressure!.verdict === "would_fail"
          ? "RO's pressure-test says this would fail — fix the high-severity attacks first."
          : "RO pressure-tested it and it holds."
        : "Run RO's pressure-test first.",
    },
    {
      name: "Your edge injected",
      pass: hasEdge,
      detail: hasEdge
        ? "Your insight anchors the thesis."
        : "Answer RO's interview question — your edge has to be in here.",
    },
    {
      name: "Provenance threshold",
      pass: your_pct >= PROVENANCE_THRESHOLD,
      detail:
        your_pct >= PROVENANCE_THRESHOLD
          ? `${your_pct}% of this is your thinking.`
          : `Only ${your_pct}% is yours — the studio won't ship a 100%-RO artifact. Make more of it yours.`,
    },
  );
  return { ok: checks.every((c) => c.pass), checks };
}
