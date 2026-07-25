import { describe, it, expect } from "vitest";
import { exploreEvents } from "@/lib/explore-events";

describe("explore-events · thread → decision_events", () => {
  it("maps each distinct question to one mild-intent view row", () => {
    const rows = exploreEvents([
      { q: "Which roles sponsor visas?", cited: [{ id: "r1" }, { id: "r2" }] },
      { q: "What do they pay?", cited: [] },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "explore", action: "view", weight: 2, subject_ref: null });
    expect(rows[0].payload.question).toBe("Which roles sponsor visas?");
    expect(rows[0].payload.cited).toEqual(["r1", "r2"]);
  });

  it("dedupes repeated questions (case-insensitive) and drops empties", () => {
    const rows = exploreEvents([
      { q: "Which are remote?" },
      { q: "which are remote?" },
      { q: "   " },
      { q: "" },
    ]);
    expect(rows).toHaveLength(1);
  });

  it("is deterministic and handles an empty thread", () => {
    expect(exploreEvents([])).toEqual([]);
    const a = exploreEvents([{ q: "same" }]);
    const b = exploreEvents([{ q: "same" }]);
    expect(a).toEqual(b);
  });
});
