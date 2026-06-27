import { describe, it, expect } from "vitest";
import { authenticityGate, type BuildContent } from "@/lib/build";

/**
 * The enforced authenticity gate — the heart of gate 3. These lock two things:
 * (1) it stays impossible to ship a 100%-RO artifact, and (2) the prototype
 * canvas additionally requires a built prototype, without weakening the document
 * canvas.
 */
const woven = (yours: string) => ({
  edge: { question: "q", answer: "a", weaved: true },
  pressure: { verdict: "would_pass" },
  sections: [
    { id: "spine", title: "Approach", body: "x".repeat(100), provenance: "ro" as const },
    { id: "your-edge", title: "Your edge", body: yours, provenance: "you" as const },
  ],
});

describe("authenticityGate", () => {
  it("blocks a document canvas with too little of the human's thinking", () => {
    const c = { canvas_type: "prd", brief: "b", phase: 6, ...woven("x".repeat(10)) } as BuildContent;
    const g = authenticityGate(c);
    expect(g.ok).toBe(false);
    expect(g.checks.find((x) => x.name === "Provenance threshold")!.pass).toBe(false);
  });

  it("passes a document canvas once the edge anchors enough of it", () => {
    const c = { canvas_type: "prd", brief: "b", phase: 6, ...woven("x".repeat(60)) } as BuildContent;
    expect(authenticityGate(c).ok).toBe(true);
  });

  it("prototype canvas: blocked until a prototype is built", () => {
    const base = { canvas_type: "prototype", brief: "b", phase: 6, ...woven("x".repeat(60)) } as BuildContent;
    const g1 = authenticityGate(base);
    expect(g1.checks.some((x) => x.name === "Prototype built")).toBe(true);
    expect(g1.ok).toBe(false);

    // harness files alone don't count as "built" — needs real app source
    const harnessOnly: BuildContent = {
      ...base,
      prototype: {
        files: [{ path: "package.json", content: "{}" }],
        preview_url: null,
        sandbox_status: "error",
        sandbox_note: "",
      },
    };
    expect(authenticityGate(harnessOnly).checks.find((x) => x.name === "Prototype built")!.pass).toBe(
      false,
    );

    const built: BuildContent = {
      ...base,
      prototype: {
        files: [
          { path: "package.json", content: "{}" },
          { path: "src/main.jsx", content: "createRoot(...)" },
        ],
        preview_url: null, // offline is fine — code is real
        sandbox_status: "offline",
        sandbox_note: "",
      },
    };
    expect(authenticityGate(built).ok).toBe(true);
  });

  it("document canvas has no 'Prototype built' check", () => {
    const c = { canvas_type: "prd", brief: "b", phase: 6, ...woven("x".repeat(60)) } as BuildContent;
    expect(c.canvas_type === "prd" && authenticityGate(c).checks.some((x) => x.name === "Prototype built")).toBe(
      false,
    );
  });
});
