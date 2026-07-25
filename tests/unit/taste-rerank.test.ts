import { describe, it, expect } from "vitest";
import { applyTasteDeltas } from "@/lib/taste-rerank";
import type { MatchedRole } from "@/lib/run-match";

function role(id: string, fit: number): MatchedRole {
  return {
    id,
    company: `Co-${id}`,
    role_title: `Role ${id}`,
    url: null,
    distance: 0,
    archetype: null,
    must_haves: null,
    nice_to_haves: null,
    comp: null,
    fit,
    recommendation: "maybe",
    why: "",
    gaps: [],
  } as unknown as MatchedRole;
}

describe("applyTasteDeltas", () => {
  it("adjusts fit, attaches the labeled reason, and re-sorts", () => {
    const matches = [role("a", 80), role("b", 78), role("c", 60)];
    const deltas = new Map([
      ["b", { delta: 10, reason: "you want AI-native" }],
      ["a", { delta: -5, reason: "you're avoiding big-tech" }],
    ]);
    const out = applyTasteDeltas(matches, deltas);
    // b: 78+10=88 now leads; a: 80-5=75
    expect(out.map((m) => m.id)).toEqual(["b", "a", "c"]);
    expect(out[0]).toMatchObject({ id: "b", fit: 88, taste: { delta: 10, reason: "you want AI-native" } });
    expect(out.find((m) => m.id === "a")?.taste).toEqual({ delta: -5, reason: "you're avoiding big-tech" });
    expect(out.find((m) => m.id === "c")?.taste).toBeUndefined(); // untouched
  });

  it("caps the delta at ±12 and clamps fit to [0,100]", () => {
    const out = applyTasteDeltas([role("a", 95), role("b", 5)], new Map([
      ["a", { delta: 50, reason: "x" }],
      ["b", { delta: -50, reason: "y" }],
    ]));
    expect(out.find((m) => m.id === "a")?.fit).toBe(100); // 95 + capped 12 → clamp 100
    expect(out.find((m) => m.id === "b")?.fit).toBe(0); // 5 - capped 12 → clamp 0
  });

  it("ignores zero / non-finite deltas and provides a fallback reason", () => {
    const out = applyTasteDeltas([role("a", 70)], new Map([["a", { delta: 0, reason: "" }]]));
    expect(out[0].taste).toBeUndefined();
    const out2 = applyTasteDeltas([role("a", 70)], new Map([["a", { delta: 4, reason: "" }]]));
    expect(out2[0].taste?.reason).toBeTruthy(); // fallback label when reason blank
  });

  it("returns matches unchanged when there are no deltas", () => {
    const matches = [role("a", 80), role("b", 60)];
    const out = applyTasteDeltas(matches, new Map());
    expect(out.map((m) => m.id)).toEqual(["a", "b"]);
    expect(out.every((m) => m.taste === undefined)).toBe(true);
  });
});
