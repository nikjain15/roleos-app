import { skill } from "../skill";
import { parsePrototypeOutput } from "@/lib/sandbox";

/**
 * Build studio · prototype canvas — generate a RUNNABLE prototype (journey.html §7,
 * RO leads the scaffold). RO produces a self-contained, single-page Vite + React
 * app that demonstrates the chosen bet — real, working code, not a mock.
 *
 * Output format is DELIMITED, not JSON: code is emitted raw between @@FILE markers
 * instead of escaped into JSON strings. JSON-encoding code is token-hostile (every
 * newline/quote is escaped, ~2x the tokens) and fragile to parse — a delimited
 * format halves the token cost and parses code robustly. See parsePrototypeOutput.
 *
 * Hard contract (so the sandbox can always serve it — see lib/sandbox.ts):
 *  - a Vite React app; `npm run dev` serves on 0.0.0.0:8080 (the normalizer enforces it)
 *  - ONLY react/react-dom + vite/@vitejs/plugin-react as deps (egress is locked
 *    to the npm registry; no other network calls at runtime)
 *  - no backend, no external API/fetch — everything runs client-side, in-memory
 *
 * Structured + judged (mirrors build_spine): the critic logs to agent_runs.
 */
export default skill({
  id: "build_code",
  model: "code",
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
      "- Vite + React only. Deps: react, react-dom (+ vite, @vitejs/plugin-react). NO other npm deps.",
      "- NO backend, NO fetch/XHR/websocket, NO external APIs, CDNs, fonts, or images. All data in-memory.",
      "- No UI libraries, no Tailwind. Plain inline styles or one small CSS file.",
      "",
      "KEEP IT MINIMAL — this is the #1 rule. ONE focused screen demonstrating the core flow, not a full",
      "app. Aim for ~120–200 lines of app code total in a single src/main.jsx. Restraint reads as senior.",
      "",
      "OUTPUT FORMAT — emit EXACTLY this, raw code between markers, NOTHING else (no prose, no ``` fences):",
      '@@META {"name":"kebab-name","summary":"one line, RO\'s voice, what this proves","entry":"src/main.jsx","walkthrough":["what to click / notice","..."]}',
      "@@FILE package.json",
      "<raw file content>",
      "@@FILE index.html",
      "<raw file content>",
      "@@FILE src/main.jsx",
      "<raw file content>",
      "@@END",
      "",
      "Rules for the format: one @@META line of strict JSON first; then each file as `@@FILE <path>` on its",
      "own line followed by its raw content; finish with @@END. index.html must load /src/main.jsx into #root.",
    ].join("\n"),
    user: `BRIEF:\n${data.brief}\n\nCHOSEN BET:\n${JSON.stringify(data.bet)}\n\nRUBRIC:\n${JSON.stringify(
      data.rubric,
    )}${
      data.edge ? `\n\nTHE CANDIDATE'S EDGE (anchor the demo on this):\n${JSON.stringify(data.edge)}` : ""
    }\n\nBuild the minimal runnable prototype in the delimited format. No prose.`,
  }),
  expects: (text) => {
    const g = parsePrototypeOutput(text);
    // a real prototype has app source, not just the harness
    return !!g && g.files.some((f) => f.path.startsWith("src/") && f.content.trim().length > 0);
  },
});
