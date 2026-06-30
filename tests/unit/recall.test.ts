import { describe, it, expect } from "vitest";
import { mergeHits } from "@/lib/match";

/**
 * mergeHits is the union step of multi-query recall — the core of the
 * domain-bias fix. It must: union roles across queries, keep each role's BEST
 * (smallest) distance, and return them nearest-first. A role that is a strong
 * neighbour of ONLY ONE facet must still surface (that's the whole point — a
 * function match the raw-profile vector ranked low gets in via its facet).
 */
describe("mergeHits", () => {
  it("unions across lists and keeps the best distance per role", () => {
    const out = mergeHits([
      [
        { role_id: "a", distance: 0.5 },
        { role_id: "b", distance: 0.6 },
      ],
      [
        { role_id: "a", distance: 0.2 }, // better distance for a — should win
        { role_id: "c", distance: 0.4 },
      ],
    ]);
    expect(out).toEqual([
      { role_id: "a", distance: 0.2 },
      { role_id: "c", distance: 0.4 },
      { role_id: "b", distance: 0.6 },
    ]);
  });

  it("surfaces a role that only one facet found", () => {
    const out = mergeHits([
      [{ role_id: "fintech-1", distance: 0.3 }],
      [{ role_id: "ai-pm-1", distance: 0.35 }], // only the function facet found this
    ]);
    expect(out.map((h) => h.role_id)).toContain("ai-pm-1");
  });

  it("is nearest-first and de-duplicated", () => {
    const out = mergeHits([
      [
        { role_id: "x", distance: 0.9 },
        { role_id: "y", distance: 0.1 },
      ],
      [{ role_id: "x", distance: 0.9 }],
    ]);
    expect(out).toEqual([
      { role_id: "y", distance: 0.1 },
      { role_id: "x", distance: 0.9 },
    ]);
  });

  it("returns empty for no hits", () => {
    expect(mergeHits([])).toEqual([]);
    expect(mergeHits([[], []])).toEqual([]);
  });
});
