import { describe, it, expect } from "vitest";
import weeklyReview from "@/agent/skills/weekly_review";

/** X7 — the weekly_review skill contract. */
describe("weekly_review skill", () => {
  it("reason tier, full gate, no tools, structured", () => {
    expect(weeklyReview.model).toBe("reason");
    expect(weeklyReview.gate).toBe("full");
    expect(weeklyReview.tools).toEqual([]);
    expect(weeklyReview.structured).toBe(true);
  });

  it("prompt enforces grounding, no guilt, wellbeing-first, and proposal-only pivots", () => {
    const { system, user } = weeklyReview.prompt({
      userId: "u1",
      data: { state: { week_of: "2026-07-03", last7: { sends: 4 } } },
    });
    expect(system).toContain("Never invent");
    expect(system).toContain("NO guilt");
    expect(system).toContain("Wellbeing over engagement");
    expect(system).toContain("at most 3");
    expect(user).toContain('"sends": 4');
  });

  it("expects: headline + pivots array + next_week array, rejects junk", () => {
    const ok = JSON.stringify({
      headline: "A steady week",
      pace_read: "4 of 5 planned sends.",
      working: [],
      not_working: [],
      pivots: [],
      next_week: ["Send the 2 ready drafts"],
      wellbeing_note: "You're doing fine.",
    });
    expect(weeklyReview.expects!(ok)).toBe(true);
    expect(weeklyReview.expects!(JSON.stringify({ headline: "x" }))).toBe(false);
    expect(weeklyReview.expects!(JSON.stringify({ pivots: [], next_week: [] }))).toBe(false);
    expect(weeklyReview.expects!("not json")).toBe(false);
  });
});
