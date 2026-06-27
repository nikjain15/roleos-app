import { skill } from "../skill";
import { parseModelJson } from "@/lib/json";

/**
 * Build studio · prototype canvas — generate a RUNNABLE prototype (journey.html §7,
 * RO leads the scaffold). RO produces a self-contained, single-page Vite + React
 * app that demonstrates the chosen bet — real, working code, not a mock. The human
 * still owns the bet and injects their edge; this is the "build the spine" phase
 * for the prototype/MVP canvas type.
 *
 * Hard contract (so the sandbox can always serve it — see lib/sandbox.ts):
 *  - a Vite React app; `npm run dev` must serve on 0.0.0.0:8080
 *  - ONLY react/react-dom + vite/@vitejs/plugin-react as deps (egress is locked
 *    to the npm registry; no other network calls at runtime)
 *  - no backend, no external API/fetch — everything runs client-side, in-memory
 *
 * Structured + judged (mirrors build_spine): the critic logs to agent_runs; the
 * generated code is returned regardless (status doesn't gate the route).
 */
export default skill({
  id: "build_code",
  model: "draft",
  tools: [],
  gate: "full",
  structured: true,
  prompt: ({ data }) => ({
    system: [
      "You are RO, building a working prototype to demonstrate the candidate's strategic bet for a",
      "senior AI/PM take-home. Generate a self-contained, single-page Vite + React app that someone",
      "can click through and immediately understand the idea. Make it real and senior: thoughtful UX,",
      "realistic in-memory sample data, interactive state — not a static mock, not lorem ipsum.",
      "",
      "HARD CONSTRAINTS (the sandbox enforces these — violating them means it won't run):",
      "- Vite + React only. package.json deps: react, react-dom; devDeps: vite, @vitejs/plugin-react.",
      '- "dev" script MUST be exactly: "vite --host 0.0.0.0 --port 8080".',
      "- index.html loads /src/main.jsx; entry renders into #root.",
      "- NO backend, NO fetch/XHR/websocket, NO external APIs or CDNs — all data is in-memory mock data.",
      "- Inline styles or a single CSS file; no UI libraries, no Tailwind, no extra npm deps.",
      "- Keep it to a handful of files; every file must be complete and runnable (no TODOs, no ...).",
      "",
      "Return STRICT JSON only, no prose around it:",
      '{"name": "kebab-case-app-name",',
      ' "summary": "one line, RO\'s voice, what this prototype proves",',
      ' "entry": "src/main.jsx",',
      ' "files": [{"path": "package.json", "content": "..."}, {"path": "index.html", "content": "..."}, {"path": "vite.config.js", "content": "..."}, {"path": "src/main.jsx", "content": "..."}],',
      ' "walkthrough": ["what to click / notice, one bullet each"]}',
    ].join("\n"),
    user: `BRIEF:\n${data.brief}\n\nCHOSEN BET:\n${JSON.stringify(data.bet)}\n\nRUBRIC:\n${JSON.stringify(
      data.rubric,
    )}${
      data.edge ? `\n\nTHE CANDIDATE'S EDGE (anchor the demo on this):\n${JSON.stringify(data.edge)}` : ""
    }\n\nBuild the runnable prototype. JSON only.`,
  }),
  expects: (text) => {
    const o = parseModelJson<{ files?: unknown; entry?: unknown }>(text);
    if (!o || !Array.isArray(o.files) || o.files.length === 0) return false;
    const files = o.files as { path?: unknown; content?: unknown }[];
    const ok = files.every(
      (f) => typeof f.path === "string" && typeof f.content === "string" && f.content.length > 0,
    );
    // Must include a package.json (the sandbox needs it to install + run).
    return ok && files.some((f) => f.path === "package.json");
  },
});
